import { Hono } from 'hono'
import type { Context } from 'hono'
import type { Env, HonoVariables, AuthContext, Hub } from '../../types'
import { requireAuth } from '../../middleware/auth'
import { nanoid } from '../../lib/nanoid'
import type { OrderFareRow, OrderRow, SellerRow } from './types'
import { computeDistanceKm, geocodeAddress } from './lib/geocoder'
import { getFareConfig, quoteFare } from './lib/fare'
import { mintTrackingToken, storeTrackingToken } from './lib/hmac'

const d1 = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

interface CreateOrderBody {
  customerName?: string
  customerPhone?: string
  customerEmail?: string
  address?: string
  hubId?: string
  parcelWeight?: number
  parcelSize?: 'small' | 'medium' | 'large'
  deliveryWindowStart?: string
  deliveryWindowEnd?: string
  notes?: string
}

function jsonError(
  c: Context<{ Bindings: Env; Variables: HonoVariables }>,
  status: number,
  error: string,
  field?: string,
) {
  return c.json(field ? { error, field } : { error }, { status: status as 400 | 401 | 403 | 404 })
}

async function resolveSellerForAuth(env: Env, auth: AuthContext): Promise<SellerRow | null> {
  if (auth.orgId) {
    const scoped = await env.DB.prepare(
      'SELECT * FROM sellers WHERE clerk_user_id = ? AND tenant_id = ? LIMIT 1',
    )
      .bind(auth.userId, auth.orgId)
      .first<SellerRow>()

    if (scoped) return scoped
  }

  return env.DB.prepare(
    'SELECT * FROM sellers WHERE clerk_user_id = ? ORDER BY created_at DESC LIMIT 1',
  )
    .bind(auth.userId)
    .first<SellerRow>()
}

async function resolveSellerForWrite(env: Env, auth: AuthContext): Promise<SellerRow | null> {
  if (auth.role === 'seller') {
    return resolveSellerForAuth(env, auth)
  }

  return env.DB.prepare('SELECT * FROM sellers WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 1')
    .bind(auth.orgId)
    .first<SellerRow>()
}

function getTenantScope(auth: AuthContext, seller?: SellerRow | null): string {
  if (auth.role === 'seller') {
    return seller?.tenant_id ?? auth.orgId
  }

  return auth.orgId
}

function safeParseMetadata(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

interface TrackingEventRow {
  event_type: string
  metadata: string
  created_at: string
}

function buildStatusTimeline(
  events: TrackingEventRow[],
): Array<{ status: string; ts: string }> {
  const seen = new Set<string>()
  const timeline: Array<{ status: string; ts: string }> = []

  for (const event of events) {
    let status: string | null = null

    if (event.event_type === 'order.created') {
      status = 'placed'
    } else if (event.event_type === 'order.status_changed') {
      const metadata = safeParseMetadata(event.metadata)
      status = typeof metadata.to === 'string' ? metadata.to : null
    } else if (event.event_type === 'order.delivered') {
      status = 'delivered'
    } else if (event.event_type === 'order.failed') {
      status = 'failed'
    } else if (event.event_type === 'order.rescheduled') {
      status = 'rescheduled'
    }

    if (!status || seen.has(status)) continue

    timeline.push({ status, ts: event.created_at })
    seen.add(status)
  }

  return timeline
}

d1.get('/track/:token', async (c) => {
  const token = c.req.param('token').trim()
  if (!token) return c.json({ error: 'Tracking token is required' }, 400)

  const cachedOrderId = await c.env.KV.get(`tracking_token:${token}`)

  const orderById = cachedOrderId
    ? await c.env.DB.prepare('SELECT * FROM orders WHERE id = ? LIMIT 1')
        .bind(cachedOrderId)
        .first<OrderRow>()
    : null

  const order =
    orderById ??
    (await c.env.DB.prepare('SELECT * FROM orders WHERE tracking_token = ? LIMIT 1')
      .bind(token)
      .first<OrderRow>())

  if (!order || order.tracking_token !== token) {
    return c.json({ error: 'Tracking link not found' }, 404)
  }

  const trackingMode = await c.env.KV.get(`tracking_mode:${order.id}`)
  const mode =
    trackingMode === 'live' || order.status === 'in_transit' ? 'live' : 'milestone'

  const { results: events } = await c.env.DB.prepare(
    `SELECT event_type, metadata, created_at
     FROM delivery_events
     WHERE order_id = ?
       AND event_type IN (
         'order.created',
         'order.status_changed',
         'order.delivered',
         'order.failed',
         'order.rescheduled'
       )
     ORDER BY created_at ASC`,
  )
    .bind(order.id)
    .all<TrackingEventRow>()

  const statusTimeline = buildStatusTimeline(events)

  const stop = await c.env.DB.prepare(
    `SELECT
       rs.id AS stop_id,
       rs.eta AS stop_eta,
       r.agent_id AS agent_id,
       r.status AS route_status,
       a.name AS agent_name,
       a.photo_url AS agent_photo
     FROM route_stops rs
     JOIN routes r ON r.id = rs.route_id
     LEFT JOIN delivery_agents a ON a.id = r.agent_id
     WHERE rs.order_id = ?
     ORDER BY
       CASE WHEN r.status = 'active' THEN 0 ELSE 1 END,
       r.date DESC,
       rs.sequence_no DESC
     LIMIT 1`,
  )
    .bind(order.id)
    .first<{
      stop_id: string
      stop_eta: string | null
      agent_id: string | null
      route_status: string
      agent_name: string | null
      agent_photo: string | null
    }>()

  let eta = stop?.stop_eta ?? null
  if (stop?.stop_id) {
    const cachedEta = await c.env.KV.get<{ eta?: string }>(`eta:stop:${stop.stop_id}`, 'json')
    if (cachedEta?.eta) eta = cachedEta.eta
  }

  return c.json({
    mode,
    order: {
      id: order.id,
      status: order.status,
      customerName: order.customer_name,
      address: order.address,
      trackingToken: order.tracking_token,
    },
    statusTimeline,
    agentId: stop?.agent_id ?? undefined,
    agentName: stop?.agent_name ?? undefined,
    agentPhoto: stop?.agent_photo ?? undefined,
    eta,
  })
})

d1.get('/api/orders', requireAuth('seller', 'admin', 'dispatcher', 'agent'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const { status, hubId, limit = '50' } = c.req.query()

  let seller: SellerRow | null = null
  if (auth.role === 'seller') {
    seller = await resolveSellerForAuth(c.env, auth)
    if (!seller) return c.json({ orders: [] })
  }

  const tenantId = getTenantScope(auth, seller)
  const parts = ['SELECT * FROM orders WHERE tenant_id = ?']
  const params: unknown[] = [tenantId]

  if (auth.role === 'seller') {
    parts.push('AND seller_id = ?')
    params.push(seller!.id)
  }

  if (status) {
    parts.push('AND status = ?')
    params.push(status)
  }
  if (hubId) {
    parts.push('AND hub_id = ?')
    params.push(hubId)
  }

  parts.push(`ORDER BY created_at DESC LIMIT ${Math.max(1, Math.min(100, parseInt(limit, 10) || 50))}`)

  const { results } = await c.env.DB.prepare(parts.join(' ')).bind(...params).all<OrderRow>()
  return c.json({ orders: results })
})

d1.get('/api/orders/:id', requireAuth('seller', 'admin', 'dispatcher', 'agent'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const orderId = c.req.param('id')
  const seller = auth.role === 'seller' ? await resolveSellerForAuth(c.env, auth) : null
  const tenantId = getTenantScope(auth, seller)

  const order = await c.env.DB.prepare(
    'SELECT * FROM orders WHERE id = ? AND tenant_id = ? LIMIT 1',
  )
    .bind(orderId, tenantId)
    .first<OrderRow>()

  if (!order) return c.json({ error: 'Order not found' }, 404)

  if (auth.role === 'seller') {
    if (!seller || seller.id !== order.seller_id) return c.json({ error: 'Forbidden' }, 403)
  }

  const fare = await c.env.DB.prepare(
    'SELECT * FROM order_fares WHERE order_id = ? LIMIT 1',
  )
    .bind(orderId)
    .first<OrderFareRow>()

  return c.json({ order, fare })
})

d1.post('/api/orders', requireAuth('seller', 'admin'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const body = await c.req.json<CreateOrderBody>().catch(() => null)

  if (!body) return jsonError(c, 400, 'Invalid JSON body')
  if (!body.customerName?.trim()) return jsonError(c, 400, 'customerName is required', 'customerName')
  if (!body.address?.trim()) return jsonError(c, 400, 'address is required', 'address')
  if (!body.hubId?.trim()) return jsonError(c, 400, 'hubId is required', 'hubId')

  const parcelWeight = Number(body.parcelWeight ?? 0)
  if (!Number.isFinite(parcelWeight) || parcelWeight <= 0) {
    return jsonError(c, 400, 'parcelWeight must be greater than 0', 'parcelWeight')
  }

  const parcelSize = body.parcelSize ?? 'small'
  if (!['small', 'medium', 'large'].includes(parcelSize)) {
    return jsonError(c, 400, 'parcelSize must be small, medium, or large', 'parcelSize')
  }

  const seller = await resolveSellerForWrite(c.env, auth)
  if (!seller) return c.json({ error: 'Seller profile not found' }, 404)
  const tenantId = getTenantScope(auth, seller)

  const hub = await c.env.DB.prepare(
    'SELECT * FROM hubs WHERE id = ? AND tenant_id = ? LIMIT 1',
  )
    .bind(body.hubId.trim(), tenantId)
    .first<Hub>()

  if (!hub) return jsonError(c, 404, 'Hub not found', 'hubId')

  const geocoded = await geocodeAddress(c.env, body.address.trim())
  const distanceKm = computeDistanceKm(hub, geocoded)
  const fareConfig = await getFareConfig(c.env, tenantId)

  let windowHours: number | null = null
  let deliveryWindowStart: string | null = null
  let deliveryWindowEnd: string | null = null

  if (body.deliveryWindowStart) {
    const parsed = new Date(body.deliveryWindowStart)
    if (Number.isNaN(parsed.getTime())) {
      return jsonError(c, 400, 'deliveryWindowStart must be a valid date', 'deliveryWindowStart')
    }
    deliveryWindowStart = parsed.toISOString()
  }

  if (body.deliveryWindowEnd) {
    const parsed = new Date(body.deliveryWindowEnd)
    if (Number.isNaN(parsed.getTime())) {
      return jsonError(c, 400, 'deliveryWindowEnd must be a valid date', 'deliveryWindowEnd')
    }
    deliveryWindowEnd = parsed.toISOString()
  }

  if (deliveryWindowStart && deliveryWindowEnd) {
    const ms = new Date(deliveryWindowEnd).getTime() - new Date(deliveryWindowStart).getTime()
    if (ms <= 0) {
      return jsonError(c, 400, 'deliveryWindowEnd must be after deliveryWindowStart', 'deliveryWindowEnd')
    }
    windowHours = ms / (1000 * 60 * 60)
  }

  const fareBreakdown = quoteFare(fareConfig, distanceKm, parcelWeight, windowHours, 1)
  const orderId = `order_${nanoid()}`
  const fareId = `fare_${nanoid()}`
  const trackingToken = await mintTrackingToken(c.env, orderId, tenantId)

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO orders (
        id, tenant_id, seller_id, customer_name, customer_phone, customer_email,
        address, lat, lng, hub_id, status, parcel_weight, parcel_size,
        delivery_window_start, delivery_window_end, tracking_token, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'placed', ?, ?, ?, ?, ?, ?)`,
    ).bind(
      orderId,
      tenantId,
      seller.id,
      body.customerName.trim(),
      body.customerPhone?.trim() || null,
      body.customerEmail?.trim() || null,
      body.address.trim(),
      geocoded.lat,
      geocoded.lng,
      hub.id,
      parcelWeight,
      parcelSize,
      deliveryWindowStart,
      deliveryWindowEnd,
      trackingToken,
      body.notes?.trim() || null,
    ),
    c.env.DB.prepare(
      `INSERT INTO order_fares (
        id, order_id, quoted_fare, settled_fare, distance_km, breakdown, status
      ) VALUES (?, ?, ?, NULL, ?, ?, 'quoted')`,
    ).bind(
      fareId,
      orderId,
      fareBreakdown.total,
      distanceKm,
      JSON.stringify(fareBreakdown),
    ),
  ])

  await Promise.all([
    storeTrackingToken(c.env, trackingToken, orderId),
    c.env.QUEUE_ORDER_CREATED.send({
      type: 'order.created',
      orderId,
      tenantId,
      hubId: hub.id,
      createdAt: new Date().toISOString(),
    }),
  ])

  return c.json(
    {
      orderId,
      status: 'placed',
      trackingToken,
      quotedFare: fareBreakdown.total,
      fareBreakdown,
    },
    201,
  )
})

d1.get('/api/sellers/me', requireAuth('seller'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const seller = await resolveSellerForAuth(c.env, auth)
  if (!seller) return c.json({ error: 'Seller not found' }, 404)

  return c.json({
    ...seller,
    api_key_hash: seller.api_key_hash ? 'redacted' : null,
  })
})

export default d1
