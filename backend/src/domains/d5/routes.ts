import { Hono } from 'hono'
import type { Env, HonoVariables, AuthContext } from '../../types'
import { requireAuth } from '../../middleware/auth'
import { nanoid } from '../../lib/nanoid'
import { logEvent } from '../d3/lib/logger'
import { getFareConfigCached, bustFareConfigCache, computeFare, rowToConfig } from './fare'
import type {
  FareConfigRow,
  FareRow,
  EarningRow,
  FeedbackRow,
  SubmitFeedbackBody,
} from './types'

const d5 = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// ── GET /api/fare/config ──────────────────────────────────────────────────────
// Get tenant fare config. KV-cached.

d5.get('/api/fare/config', requireAuth('admin', 'dispatcher'), async (c) => {
  const auth = c.get('auth') as AuthContext

  const config = await getFareConfigCached(c.env.KV, c.env.DB, auth.orgId)
  if (!config) {
    // Return sensible defaults if no config exists yet
    return c.json({
      baseFare: 20,
      perKmRate: 5,
      weightTier1Max: 1,
      weightTier1Surcharge: 0,
      weightTier2Max: 5,
      weightTier2Surcharge: 10,
      weightTier3Surcharge: 25,
      zonePremiumPct: 0,
      narrowWindowPremium: 15,
      bulkThreshold: 50,
      bulkDiscountPct: 5,
    })
  }

  return c.json(config)
})

// ── PUT /api/fare/config ──────────────────────────────────────────────────────
// Update tenant fare config. Admin only. Busts KV cache.

d5.put('/api/fare/config', requireAuth('admin'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const body = await c.req.json<Partial<{
    baseFare: number
    perKmRate: number
    weightTier1Max: number
    weightTier1Surcharge: number
    weightTier2Max: number
    weightTier2Surcharge: number
    weightTier3Surcharge: number
    zonePremiumPct: number
    narrowWindowPremium: number
    bulkThreshold: number
    bulkDiscountPct: number
  }>>().catch(() => null)

  if (!body) return c.json({ error: 'Invalid JSON body' }, 400)

  const existing = await c.env.DB.prepare(
    'SELECT * FROM fare_configs WHERE tenant_id = ? LIMIT 1',
  )
    .bind(auth.orgId)
    .first<FareConfigRow>()

  if (existing) {
    // PATCH-style update — only provided fields change
    const sets: string[] = []
    const vals: unknown[] = []

    if (body.baseFare != null)            { sets.push('base_fare = ?');               vals.push(body.baseFare) }
    if (body.perKmRate != null)           { sets.push('per_km_rate = ?');              vals.push(body.perKmRate) }
    if (body.weightTier1Max != null)      { sets.push('weight_tier_1_max = ?');        vals.push(body.weightTier1Max) }
    if (body.weightTier1Surcharge != null){ sets.push('weight_tier_1_surcharge = ?');  vals.push(body.weightTier1Surcharge) }
    if (body.weightTier2Max != null)      { sets.push('weight_tier_2_max = ?');        vals.push(body.weightTier2Max) }
    if (body.weightTier2Surcharge != null){ sets.push('weight_tier_2_surcharge = ?');  vals.push(body.weightTier2Surcharge) }
    if (body.weightTier3Surcharge != null){ sets.push('weight_tier_3_surcharge = ?');  vals.push(body.weightTier3Surcharge) }
    if (body.zonePremiumPct != null)      { sets.push('zone_premium_pct = ?');         vals.push(body.zonePremiumPct) }
    if (body.narrowWindowPremium != null) { sets.push('narrow_window_premium = ?');    vals.push(body.narrowWindowPremium) }
    if (body.bulkThreshold != null)       { sets.push('bulk_threshold = ?');           vals.push(body.bulkThreshold) }
    if (body.bulkDiscountPct != null)     { sets.push('bulk_discount_pct = ?');        vals.push(body.bulkDiscountPct) }

    if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400)

    sets.push("updated_at = datetime('now')")
    vals.push(auth.orgId)

    await c.env.DB.prepare(
      `UPDATE fare_configs SET ${sets.join(', ')} WHERE tenant_id = ?`,
    )
      .bind(...vals)
      .run()
  } else {
    // Create with defaults + provided values
    const id = `fconf_${nanoid()}`
    await c.env.DB.prepare(
      `INSERT INTO fare_configs
         (id, tenant_id, base_fare, per_km_rate,
          weight_tier_1_max, weight_tier_1_surcharge,
          weight_tier_2_max, weight_tier_2_surcharge, weight_tier_3_surcharge,
          zone_premium_pct, narrow_window_premium, bulk_threshold, bulk_discount_pct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id, auth.orgId,
        body.baseFare ?? 20,
        body.perKmRate ?? 5,
        body.weightTier1Max ?? 1,
        body.weightTier1Surcharge ?? 0,
        body.weightTier2Max ?? 5,
        body.weightTier2Surcharge ?? 10,
        body.weightTier3Surcharge ?? 25,
        body.zonePremiumPct ?? 0,
        body.narrowWindowPremium ?? 15,
        body.bulkThreshold ?? 50,
        body.bulkDiscountPct ?? 5,
      )
      .run()
  }

  await bustFareConfigCache(c.env.KV, auth.orgId)

  const updated = await c.env.DB.prepare(
    'SELECT * FROM fare_configs WHERE tenant_id = ? LIMIT 1',
  )
    .bind(auth.orgId)
    .first<FareConfigRow>()

  return c.json(rowToConfig(updated!))
})

// ── GET /api/fare/quote ───────────────────────────────────────────────────────
// Get fare quote for an order (existing record or live calculation).

d5.get('/api/fare/quote', requireAuth('admin', 'dispatcher', 'seller'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const orderId = c.req.query('orderId')

  if (!orderId) return c.json({ error: 'orderId query param is required' }, 400)

  // If an existing fare record exists, return it
  const existing = await c.env.DB.prepare(
    'SELECT * FROM order_fares WHERE order_id = ? LIMIT 1',
  )
    .bind(orderId)
    .first<FareRow>()

  if (existing) {
    return c.json({
      orderId,
      quotedFare: existing.quoted_fare,
      settledFare: existing.settled_fare,
      status: existing.status,
      breakdown: safeParseJson(existing.breakdown),
    })
  }

  // Compute on-the-fly from order + config
  const order = await c.env.DB.prepare(
    'SELECT * FROM orders WHERE id = ? AND tenant_id = ? LIMIT 1',
  )
    .bind(orderId, auth.orgId)
    .first<{
      id: string
      lat: number
      lng: number
      hub_id: string | null
      parcel_weight: number
      delivery_window_start: string | null
      delivery_window_end: string | null
    }>()

  if (!order) return c.json({ error: 'Order not found' }, 404)

  const config = await getFareConfigCached(c.env.KV, c.env.DB, auth.orgId)
  if (!config) return c.json({ error: 'Fare config not found for tenant' }, 404)

  // Estimate distance from hub (fallback: 5 km)
  let distanceKm = 5
  if (order.hub_id) {
    const hub = await c.env.DB.prepare(
      'SELECT lat, lng FROM hubs WHERE id = ? LIMIT 1',
    )
      .bind(order.hub_id)
      .first<{ lat: number; lng: number }>()

    if (hub) {
      distanceKm = haversineKm(hub.lat, hub.lng, order.lat, order.lng)
    }
  }

  const breakdown = computeFare({
    config,
    distanceKm,
    weightKg: order.parcel_weight,
    deliveryWindowStart: order.delivery_window_start,
    deliveryWindowEnd: order.delivery_window_end,
  })

  return c.json({
    orderId,
    quotedFare: breakdown.total,
    settledFare: null,
    status: 'quoted',
    breakdown,
  })
})

// ── GET /api/orders/:id/feedback ──────────────────────────────────────────────

d5.get(
  '/api/orders/:id/feedback',
  requireAuth('admin', 'dispatcher', 'seller'),
  async (c) => {
    const auth = c.get('auth') as AuthContext
    const orderId = c.req.param('id')

    // Sellers can only view feedback on their own orders
    if (auth.role === 'seller') {
      const order = await c.env.DB.prepare(
        `SELECT o.id FROM orders o
         JOIN sellers s ON s.id = o.seller_id
         WHERE o.id = ? AND s.clerk_user_id = ? LIMIT 1`,
      )
        .bind(orderId, auth.userId)
        .first<{ id: string }>()

      if (!order) return c.json({ error: 'Order not found or access denied' }, 404)
    }

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM order_feedback WHERE order_id = ? ORDER BY created_at ASC',
    )
      .bind(orderId)
      .all<FeedbackRow>()

    return c.json({ orderId, feedback: results })
  },
)

// ── POST /api/orders/:id/feedback ─────────────────────────────────────────────

d5.post(
  '/api/orders/:id/feedback',
  requireAuth('admin', 'dispatcher', 'seller', 'agent'),
  async (c) => {
    const auth = c.get('auth') as AuthContext
    const orderId = c.req.param('id') as string
    const body = await c.req.json<SubmitFeedbackBody>().catch(() => null)

    if (!body?.fromActor || !body?.rating) {
      return c.json({ error: 'fromActor and rating are required' }, 400)
    }
    if (body.rating < 1 || body.rating > 5) {
      return c.json({ error: 'rating must be between 1 and 5' }, 400)
    }
    const validActors = ['customer', 'seller', 'admin']
    if (!validActors.includes(body.fromActor)) {
      return c.json({ error: `fromActor must be one of: ${validActors.join(', ')}` }, 400)
    }

    // Verify order exists and belongs to tenant
    const order = await c.env.DB.prepare(
      'SELECT id FROM orders WHERE id = ? AND tenant_id = ? LIMIT 1',
    )
      .bind(orderId, auth.orgId)
      .first<{ id: string }>()

    if (!order) return c.json({ error: 'Order not found' }, 404)

    // Resolve agent for the order
    const agentRow = await c.env.DB.prepare(
      `SELECT r.agent_id FROM route_stops rs
       JOIN routes r ON r.id = rs.route_id
       WHERE rs.order_id = ? LIMIT 1`,
    )
      .bind(orderId)
      .first<{ agent_id: string | null }>()

    const agentId = agentRow?.agent_id ?? null

    const feedbackId = `fb_${nanoid()}`
    await c.env.DB.prepare(
      'INSERT INTO order_feedback (id, order_id, agent_id, from_actor, rating, comment) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(feedbackId, orderId, agentId, body.fromActor, body.rating, body.comment ?? null)
      .run()

    await logEvent(c.env.DB, {
      orderId,
      agentId,
      actorType: body.fromActor === 'customer' ? 'customer' : body.fromActor === 'seller' ? 'seller' : 'admin',
      eventType: 'feedback.submitted',
      metadata: { rating: body.rating, fromActor: body.fromActor },
    })

    return c.json({ feedbackId }, 201)
  },
)

// ── GET /api/agents/:id/earnings ──────────────────────────────────────────────

d5.get(
  '/api/agents/:id/earnings',
  requireAuth('admin', 'dispatcher', 'agent'),
  async (c) => {
    const auth = c.get('auth') as AuthContext
    const agentId = c.req.param('id')
    const month = c.req.query('month') // YYYY-MM
    const status = c.req.query('status')

    // Agents can only view their own earnings
    if (auth.role === 'agent') {
      const own = await c.env.DB.prepare(
        'SELECT id FROM delivery_agents WHERE id = ? AND clerk_user_id = ? LIMIT 1',
      )
        .bind(agentId, auth.userId)
        .first<{ id: string }>()

      if (!own) return c.json({ error: 'Forbidden' }, 403)
    }

    const parts: string[] = ['SELECT * FROM partner_earnings WHERE agent_id = ?']
    const params: unknown[] = [agentId]

    if (month) {
      parts.push("AND strftime('%Y-%m', created_at) = ?")
      params.push(month)
    }
    if (status) {
      parts.push('AND status = ?')
      params.push(status)
    }
    parts.push('ORDER BY created_at DESC LIMIT 200')

    const { results } = await c.env.DB.prepare(parts.join(' '))
      .bind(...params)
      .all<EarningRow>()

    const totalEarnings = results.reduce((s, e) => s + e.partner_payout, 0)
    const pendingPayout = results
      .filter((e) => e.status === 'pending')
      .reduce((s, e) => s + e.partner_payout, 0)

    return c.json({
      agentId,
      period: month ?? 'all',
      totalDeliveries: results.length,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      pendingPayout: Math.round(pendingPayout * 100) / 100,
      earnings: results,
    })
  },
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Haversine distance in km between two lat/lng pairs. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100
}

export default d5
