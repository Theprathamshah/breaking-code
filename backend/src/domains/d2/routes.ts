import { Hono } from 'hono'
import type { Env, HonoVariables, AuthContext } from '../../types'
import { requireAuth } from '../../middleware/auth'
import { optimizeRoute, computeETAs } from './optimizer'
import { nanoid } from '../../lib/nanoid'

const d2 = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// ── GET /api/routes ───────────────────────────────────────────────────────────
// List routes (filtered by date, hubId, status). Used by Dispatch Dashboard.

d2.get('/api/routes', requireAuth('admin', 'dispatcher', 'agent'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const hubId  = c.req.query('hubId')
  const date   = c.req.query('date')
  const status = c.req.query('status')

  const parts: string[] = ['SELECT * FROM routes WHERE tenant_id = ?']
  const params: unknown[] = [auth.orgId]

  if (hubId)  { parts.push('AND hub_id = ?');  params.push(hubId) }
  if (date)   { parts.push('AND date = ?');     params.push(date) }
  if (status) { parts.push('AND status = ?');   params.push(status) }
  parts.push('ORDER BY created_at DESC LIMIT 50')

  const { results } = await c.env.DB.prepare(parts.join(' ')).bind(...params).all()

  // Parse optimized_sequence JSON for each route
  const routes = results.map((r) => ({
    ...r,
    optimized_sequence: JSON.parse(r.optimized_sequence as string),
  }))

  return c.json({ routes })
})

// ── GET /api/agents ───────────────────────────────────────────────────────────
// List agents for a hub. Admins/dispatchers only.

d2.get('/api/agents', requireAuth('admin', 'dispatcher'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const hubId = c.req.query('hubId') ?? auth.hubId
  const status = c.req.query('status') // available | on_route | offline

  const parts: string[] = ['SELECT * FROM delivery_agents WHERE tenant_id = ?']
  const params: unknown[] = [auth.orgId]

  if (hubId) {
    parts.push('AND hub_id = ?')
    params.push(hubId)
  }
  if (status) {
    parts.push('AND status = ?')
    params.push(status)
  }
  parts.push('ORDER BY name ASC')

  const { results } = await c.env.DB.prepare(parts.join(' '))
    .bind(...params)
    .all()

  return c.json({ agents: results })
})

// ── PATCH /api/agents/:id/status ──────────────────────────────────────────────
// Update agent availability. Agents can only update their own status.

d2.patch('/api/agents/:id/status', requireAuth('admin', 'dispatcher', 'agent'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const agentId = c.req.param('id')
  const body = await c.req.json<{ status: 'available' | 'on_route' | 'offline' }>()

  const validStatuses = ['available', 'on_route', 'offline']
  if (!validStatuses.includes(body.status)) {
    return c.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, 400)
  }

  // Agents can only touch their own row
  if (auth.role === 'agent') {
    const own = await c.env.DB.prepare(
      'SELECT id FROM delivery_agents WHERE id = ? AND clerk_user_id = ? LIMIT 1',
    )
      .bind(agentId, auth.userId)
      .first<{ id: string }>()

    if (!own) return c.json({ error: 'Forbidden' }, 403)
  }

  const result = await c.env.DB.prepare(
    "UPDATE delivery_agents SET status = ?, last_seen_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND tenant_id = ?",
  )
    .bind(body.status, agentId, auth.orgId)
    .run()

  if (result.meta.changes === 0) return c.json({ error: 'Agent not found' }, 404)

  return c.json({ success: true, agentId, status: body.status })
})

// ── POST /api/routes/optimize ────────────────────────────────────────────────
// Create a new route and optimise the stop sequence for a hub + date.
// Optionally assign to an agent immediately.

d2.post('/api/routes/optimize', requireAuth('admin', 'dispatcher'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const body = await c.req.json<{
    hubId: string
    date: string     // YYYY-MM-DD
    agentId?: string
  }>()

  if (!body.hubId || !body.date) {
    return c.json({ error: 'hubId and date are required' }, 400)
  }

  // Load hub
  const hub = await c.env.DB.prepare(
    'SELECT * FROM hubs WHERE id = ? AND tenant_id = ? LIMIT 1',
  )
    .bind(body.hubId, auth.orgId)
    .first<{ id: string; lat: number; lng: number; name: string }>()

  if (!hub) return c.json({ error: 'Hub not found' }, 404)

  // Load unassigned, ready orders for this hub + date
  const { results: orders } = await c.env.DB.prepare(
    `SELECT o.id, o.lat, o.lng, o.customer_name, o.address,
            o.parcel_weight, o.parcel_size,
            o.delivery_window_start, o.delivery_window_end
     FROM orders o
     WHERE o.hub_id = ? AND o.tenant_id = ?
       AND o.status IN ('confirmed', 'packed')
       AND (
         o.delivery_window_start IS NULL
         OR DATE(o.delivery_window_start) = ?
       )
       AND o.id NOT IN (
         SELECT rs.order_id
         FROM route_stops rs
         JOIN routes r ON r.id = rs.route_id
         WHERE r.date = ? AND rs.status NOT IN ('failed')
       )`,
  )
    .bind(body.hubId, auth.orgId, body.date, body.date)
    .all<{
      id: string
      lat: number
      lng: number
      customer_name: string
      address: string
      parcel_weight: number
      parcel_size: string
      delivery_window_start: string | null
      delivery_window_end: string | null
    }>()

  if (orders.length === 0) {
    return c.json({ error: 'No eligible orders found for this hub and date' }, 422)
  }

  // Run nearest-neighbour TSP
  const optimized = optimizeRoute(hub.lat, hub.lng, orders)

  // Default route start: 9:00 AM on the delivery date
  const startTime = new Date(`${body.date}T09:00:00.000Z`)
  const etas = computeETAs(startTime, optimized)

  // Persist route
  const routeId = `route_${nanoid()}`
  await c.env.DB.prepare(
    `INSERT INTO routes
       (id, tenant_id, agent_id, hub_id, date, status, optimized_sequence, total_distance_km, estimated_duration_mins)
     VALUES (?, ?, ?, ?, ?, 'planned', ?, ?, ?)`,
  )
    .bind(
      routeId,
      auth.orgId,
      body.agentId ?? null,
      body.hubId,
      body.date,
      JSON.stringify(optimized.sequence),
      optimized.totalDistanceKm,
      optimized.estimatedDurationMins,
    )
    .run()

  // Persist stops + cache ETAs in KV
  const stopIds: Record<string, string> = {}
  const stopStatements = optimized.sequence.map((orderId, idx) => {
    const stopId = `stop_${nanoid()}`
    stopIds[orderId] = stopId
    const eta = etas.get(orderId)?.toISOString() ?? null
    const dist = optimized.segmentDistances[idx]

    return c.env.DB.prepare(
      `INSERT INTO route_stops
         (id, route_id, order_id, sequence_no, status, eta, distance_from_prev_km)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    ).bind(stopId, routeId, orderId, idx + 1, eta, dist)
  })

  await c.env.DB.batch(stopStatements)

  // Cache ETAs in KV (TTL 10 min)
  await Promise.all(
    optimized.sequence.map((orderId, idx) => {
      const stopId = stopIds[orderId]
      const eta = etas.get(orderId)?.toISOString()
      return c.env.KV.put(
        `eta:stop:${stopId}`,
        JSON.stringify({ eta, routeId, orderId }),
        { expirationTtl: 600 },
      )
    }),
  )

  // Build response payload
  const stops = optimized.sequence.map((orderId, idx) => {
    const order = orders.find((o) => o.id === orderId)!
    return {
      stopId: stopIds[orderId],
      sequenceNo: idx + 1,
      orderId,
      customerName: order.customer_name,
      address: order.address,
      lat: order.lat,
      lng: order.lng,
      parcleWeight: order.parcel_weight,
      parcelSize: order.parcel_size,
      deliveryWindow: {
        start: order.delivery_window_start,
        end: order.delivery_window_end,
      },
      eta: etas.get(orderId)?.toISOString() ?? null,
      distanceFromPrevKm: optimized.segmentDistances[idx],
    }
  })

  return c.json(
    {
      routeId,
      hubId: body.hubId,
      hubName: hub.name,
      date: body.date,
      agentId: body.agentId ?? null,
      status: 'planned',
      totalDistanceKm: optimized.totalDistanceKm,
      estimatedDurationMins: optimized.estimatedDurationMins,
      stopCount: stops.length,
      stops,
    },
    201,
  )
})

// ── GET /api/routes/:id ───────────────────────────────────────────────────────
// Full route detail with all stops + order info. Used by agent PWA and dispatcher.

d2.get('/api/routes/:id', requireAuth('admin', 'dispatcher', 'agent'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const routeId = c.req.param('id')

  const route = await c.env.DB.prepare(
    'SELECT * FROM routes WHERE id = ? AND tenant_id = ? LIMIT 1',
  )
    .bind(routeId, auth.orgId)
    .first<Record<string, unknown>>()

  if (!route) return c.json({ error: 'Route not found' }, 404)

  // Agents can only view their own routes
  if (auth.role === 'agent') {
    const agent = await c.env.DB.prepare(
      'SELECT id FROM delivery_agents WHERE clerk_user_id = ? AND tenant_id = ? LIMIT 1',
    )
      .bind(auth.userId, auth.orgId)
      .first<{ id: string }>()

    if (!agent || route.agent_id !== agent.id) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }

  const { results: stops } = await c.env.DB.prepare(
    `SELECT
       rs.id, rs.sequence_no, rs.status, rs.eta,
       rs.actual_arrival_at, rs.actual_departure_at,
       rs.failure_reason, rs.distance_from_prev_km,
       o.id          AS order_id,
       o.customer_name, o.customer_phone, o.customer_email,
       o.address, o.lat, o.lng,
       o.parcel_weight, o.parcel_size,
       o.delivery_window_start, o.delivery_window_end,
       o.status      AS order_status,
       o.notes
     FROM route_stops rs
     JOIN orders o ON o.id = rs.order_id
     WHERE rs.route_id = ?
     ORDER BY rs.sequence_no ASC`,
  )
    .bind(routeId)
    .all()

  return c.json({
    ...route,
    optimized_sequence: JSON.parse(route.optimized_sequence as string),
    stops: stops,
  })
})

// ── PATCH /api/routes/:id/activate ────────────────────────────────────────────
// Activate a planned route: assign agent, flip statuses, publish queue event.

d2.patch('/api/routes/:id/activate', requireAuth('admin', 'dispatcher'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const routeId = c.req.param('id') as string
  const body = await c.req.json<{ agentId: string }>()

  if (!body.agentId) return c.json({ error: 'agentId is required' }, 400)

  const route = await c.env.DB.prepare(
    "SELECT * FROM routes WHERE id = ? AND tenant_id = ? AND status = 'planned' LIMIT 1",
  )
    .bind(routeId, auth.orgId)
    .first<{ id: string; hub_id: string; agent_id: string | null; date: string }>()

  if (!route) return c.json({ error: 'Route not found or not in planned state' }, 404)

  // Verify agent belongs to this tenant
  const agent = await c.env.DB.prepare(
    'SELECT id FROM delivery_agents WHERE id = ? AND tenant_id = ? LIMIT 1',
  )
    .bind(body.agentId, auth.orgId)
    .first<{ id: string }>()

  if (!agent) return c.json({ error: 'Agent not found' }, 404)

  // Count stops for the event payload
  const stopCount = await c.env.DB.prepare(
    'SELECT COUNT(*) as n FROM route_stops WHERE route_id = ?',
  )
    .bind(routeId)
    .first<{ n: number }>()

  // Batch updates: activate route, set orders out_for_delivery, set agent on_route
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE routes SET status = 'active', agent_id = ?, updated_at = datetime('now') WHERE id = ?",
    ).bind(body.agentId, routeId),

    c.env.DB.prepare(
      `UPDATE orders
       SET status = 'out_for_delivery', updated_at = datetime('now')
       WHERE id IN (
         SELECT order_id FROM route_stops WHERE route_id = ?
       ) AND status IN ('confirmed','packed')`,
    ).bind(routeId),

    c.env.DB.prepare(
      "UPDATE delivery_agents SET status = 'on_route', updated_at = datetime('now') WHERE id = ?",
    ).bind(body.agentId),
  ])

  // Publish route.activated event → D4 will email agents + customers
  await c.env.QUEUE_ROUTE_ACTIVATED.send({
    type: 'route.activated',
    routeId,
    agentId: body.agentId,
    hubId: route.hub_id,
    stopCount: stopCount?.n ?? 0,
  })

  return c.json({
    success: true,
    routeId,
    agentId: body.agentId,
    status: 'active',
    stopCount: stopCount?.n ?? 0,
  })
})

// ── GET /api/hubs ─────────────────────────────────────────────────────────────
// List hubs for the tenant. Used by Optimize Route modal and agent assignment.

d2.get('/api/hubs', requireAuth('admin', 'dispatcher'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM hubs WHERE tenant_id = ? ORDER BY name ASC',
  )
    .bind(auth.orgId)
    .all()
  return c.json({ hubs: results })
})

// ── POST /api/hubs ────────────────────────────────────────────────────────────
// Create a new hub. Admin only.

d2.post('/api/hubs', requireAuth('admin'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const body = await c.req.json<{
    name: string
    address: string
    lat: number
    lng: number
  }>()

  if (!body.name || !body.address || body.lat == null || body.lng == null) {
    return c.json({ error: 'name, address, lat, lng are required' }, 400)
  }

  const hubId = `hub_${nanoid()}`
  await c.env.DB.prepare(
    'INSERT INTO hubs (id, tenant_id, name, address, lat, lng) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(hubId, auth.orgId, body.name, body.address, body.lat, body.lng)
    .run()

  const hub = await c.env.DB.prepare('SELECT * FROM hubs WHERE id = ?').bind(hubId).first()
  return c.json(hub, 201)
})

// ── POST /api/agents ──────────────────────────────────────────────────────────
// Register a new delivery agent. Admin only.

d2.post('/api/agents', requireAuth('admin'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const body = await c.req.json<{
    clerkUserId: string
    name: string
    phone?: string
    vehicleType?: 'bike' | 'scooter' | 'van' | 'cycle'
    hubId?: string
    commissionPct?: number
  }>()

  if (!body.clerkUserId || !body.name) {
    return c.json({ error: 'clerkUserId and name are required' }, 400)
  }

  const validVehicles = ['bike', 'scooter', 'van', 'cycle']
  if (body.vehicleType && !validVehicles.includes(body.vehicleType)) {
    return c.json({ error: `vehicleType must be one of: ${validVehicles.join(', ')}` }, 400)
  }

  // Verify hub belongs to tenant if provided
  if (body.hubId) {
    const hub = await c.env.DB.prepare(
      'SELECT id FROM hubs WHERE id = ? AND tenant_id = ? LIMIT 1',
    )
      .bind(body.hubId, auth.orgId)
      .first()
    if (!hub) return c.json({ error: 'Hub not found' }, 404)
  }

  const agentId = `agent_${nanoid()}`
  await c.env.DB.prepare(
    `INSERT INTO delivery_agents
       (id, tenant_id, clerk_user_id, name, phone, vehicle_type, hub_id, commission_pct)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      agentId,
      auth.orgId,
      body.clerkUserId,
      body.name,
      body.phone ?? null,
      body.vehicleType ?? 'bike',
      body.hubId ?? null,
      body.commissionPct ?? 80,
    )
    .run()

  const agent = await c.env.DB.prepare('SELECT * FROM delivery_agents WHERE id = ?')
    .bind(agentId)
    .first()
  return c.json(agent, 201)
})

// ── GET /api/routes/:id/stops/:stopId ────────────────────────────────────────
// Single stop with joined order data. Called by D4 (agent PWA).

d2.get('/api/routes/:id/stops/:stopId', requireAuth('admin', 'dispatcher', 'agent'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const routeId = c.req.param('id')
  const stopId = c.req.param('stopId')

  const route = await c.env.DB.prepare(
    'SELECT id, agent_id FROM routes WHERE id = ? AND tenant_id = ? LIMIT 1',
  )
    .bind(routeId, auth.orgId)
    .first<{ id: string; agent_id: string | null }>()

  if (!route) return c.json({ error: 'Route not found' }, 404)

  if (auth.role === 'agent') {
    const agent = await c.env.DB.prepare(
      'SELECT id FROM delivery_agents WHERE clerk_user_id = ? AND tenant_id = ? LIMIT 1',
    )
      .bind(auth.userId, auth.orgId)
      .first<{ id: string }>()

    if (!agent || route.agent_id !== agent.id) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }

  const stop = await c.env.DB.prepare(
    `SELECT
       rs.id            AS stop_id,
       rs.sequence_no, rs.status, rs.eta,
       rs.actual_arrival_at, rs.actual_departure_at,
       rs.failure_reason, rs.distance_from_prev_km,
       o.id             AS order_id,
       o.customer_name, o.customer_phone, o.customer_email,
       o.address, o.lat, o.lng,
       o.parcel_weight, o.parcel_size,
       o.delivery_window_start, o.delivery_window_end,
       o.status         AS order_status,
       o.notes, o.tracking_token
     FROM route_stops rs
     JOIN orders o ON o.id = rs.order_id
     WHERE rs.id = ? AND rs.route_id = ?
     LIMIT 1`,
  )
    .bind(stopId, routeId)
    .first()

  if (!stop) return c.json({ error: 'Stop not found' }, 404)

  return c.json(stop)
})

// ── PATCH /api/routes/:id/stops/:stopId/status ────────────────────────────────
// D2 owns: heading_to only. D4 owns: arrived, delivered, failed.
// Side effects: orders.status → in_transit, publishes stop.departed queue event.

d2.patch(
  '/api/routes/:id/stops/:stopId/status',
  requireAuth('admin', 'dispatcher', 'agent'),
  async (c) => {
    const auth = c.get('auth') as AuthContext
    const routeId = c.req.param('id') as string
    const stopId = c.req.param('stopId') as string
    const body = await c.req.json<{ status: string }>()

    if (body.status !== 'heading_to') {
      return c.json({ error: 'Only "heading_to" is allowed via this endpoint' }, 400)
    }

    const route = await c.env.DB.prepare(
      "SELECT id, agent_id FROM routes WHERE id = ? AND tenant_id = ? AND status = 'active' LIMIT 1",
    )
      .bind(routeId, auth.orgId)
      .first<{ id: string; agent_id: string | null }>()

    if (!route) return c.json({ error: 'Route not found or not active' }, 404)

    if (auth.role === 'agent') {
      const agent = await c.env.DB.prepare(
        'SELECT id FROM delivery_agents WHERE clerk_user_id = ? AND tenant_id = ? LIMIT 1',
      )
        .bind(auth.userId, auth.orgId)
        .first<{ id: string }>()

      if (!agent || route.agent_id !== agent.id) {
        return c.json({ error: 'Forbidden' }, 403)
      }
    }

    const stop = await c.env.DB.prepare(
      `SELECT rs.id, rs.order_id, rs.eta,
              o.tracking_token, o.status AS order_status
       FROM route_stops rs
       JOIN orders o ON o.id = rs.order_id
       WHERE rs.id = ? AND rs.route_id = ? AND rs.status = 'pending'
       LIMIT 1`,
    )
      .bind(stopId, routeId)
      .first<{
        id: string
        order_id: string
        eta: string | null
        tracking_token: string | null
        order_status: string
      }>()

    if (!stop) return c.json({ error: 'Stop not found or not in pending state' }, 404)

    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE route_stops SET status = 'heading_to', updated_at = datetime('now') WHERE id = ?",
      ).bind(stopId),
      c.env.DB.prepare(
        "UPDATE orders SET status = 'in_transit', updated_at = datetime('now') WHERE id = ? AND status NOT IN ('delivered','failed')",
      ).bind(stop.order_id),
    ])

    // ETA seconds from now — KV cache first, fall back to DB column
    let etaSeconds = 0
    const kvEta = await c.env.KV.get<{ eta: string }>(`eta:stop:${stopId}`, 'json')
    const etaStr = kvEta?.eta ?? stop.eta
    if (etaStr) {
      etaSeconds = Math.max(0, Math.round((new Date(etaStr).getTime() - Date.now()) / 1000))
    }

    await c.env.QUEUE_STOP_DEPARTED.send({
      type: 'stop.departed',
      stopId,
      orderId: stop.order_id,
      agentId: route.agent_id ?? (auth.userId as string),
      trackingToken: stop.tracking_token ?? '',
      etaSeconds,
    })

    return c.json({ success: true, stopId, orderId: stop.order_id, status: 'heading_to', etaSeconds })
  },
)

export default d2
