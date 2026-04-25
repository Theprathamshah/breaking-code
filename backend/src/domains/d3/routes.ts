import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import type { Env, HonoVariables, AuthContext } from '../../types'
import { requireAuth } from '../../middleware/auth'
import { nanoid } from '../../lib/nanoid'
import { buildTimeline } from './lib/timeline'
import type { AppendEventBody, DeliveryEventRow } from './types'

const d3 = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// ── Auth helper: internal token OR valid JWT ──────────────────────────────────
// D4 calls POST /api/events with X-Internal-Token (server-to-server).
// The frontend fires events with a normal Clerk JWT (admin / dispatcher / agent).

function internalOrAuth(
  c: Context<{ Bindings: Env; Variables: HonoVariables }>,
  next: Next,
) {
  const internalToken = c.req.header('X-Internal-Token')
  if (internalToken && internalToken === c.env.HMAC_SECRET) {
    // Inject a synthetic auth context so downstream handlers can call c.get('auth')
    c.set('auth', {
      userId: 'internal',
      orgId: '',
      role: 'admin' as const,
      hubId: undefined,
    })
    return next()
  }
  // Fall through to normal Clerk JWT validation
  return requireAuth('admin', 'dispatcher', 'agent')(c, next)
}

// ── POST /api/events ──────────────────────────────────────────────────────────
// Append a single event. Called by D4 (X-Internal-Token) or frontend (JWT).

d3.post('/api/events', internalOrAuth, async (c) => {

  const body = await c.req.json<AppendEventBody>().catch(() => null)

  if (!body || !body.orderId || !body.actorType || !body.eventType) {
    return c.json({ error: 'orderId, actorType, and eventType are required' }, 400)
  }

  const eventId = `evt_${nanoid()}`

  await c.env.DB.prepare(
    `INSERT INTO delivery_events
       (id, order_id, agent_id, actor_type, event_type, lat, lng, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      eventId,
      body.orderId,
      body.agentId ?? null,
      body.actorType,
      body.eventType,
      body.lat ?? null,
      body.lng ?? null,
      JSON.stringify(body.metadata ?? {}),
    )
    .run()

  return c.json({ eventId }, 201)
})

// ── GET /api/orders/:id/events ────────────────────────────────────────────────
// Full raw event log for an order, newest first.
// Auth: admin, dispatcher, seller (own orders only)

d3.get(
  '/api/orders/:id/events',
  requireAuth('admin', 'dispatcher', 'seller'),
  async (c) => {
    const auth = c.get('auth') as AuthContext
    const orderId = c.req.param('id')
    const { limit = '100', cursor, eventType } = c.req.query()

    // Sellers may only read events for their own orders
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

    const parts: string[] = [
      'SELECT id, order_id, agent_id, actor_type, event_type, lat, lng, metadata, created_at',
      'FROM delivery_events',
      'WHERE order_id = ?',
    ]
    const params: unknown[] = [orderId]

    if (eventType) {
      parts.push('AND event_type = ?')
      params.push(eventType)
    }

    if (cursor) {
      parts.push('AND created_at < ?')
      params.push(cursor)
    }

    const parsedLimit = Math.min(parseInt(limit) || 100, 500)
    parts.push(`ORDER BY created_at DESC LIMIT ${parsedLimit + 1}`)

    const { results } = await c.env.DB.prepare(parts.join(' '))
      .bind(...params)
      .all<DeliveryEventRow>()

    const hasMore = results.length > parsedLimit
    const events = results.slice(0, parsedLimit).map((e) => ({
      id: e.id,
      actorType: e.actor_type,
      eventType: e.event_type,
      lat: e.lat,
      lng: e.lng,
      metadata: safeParseJson(e.metadata),
      createdAt: e.created_at,
    }))

    const nextCursor = hasMore ? results[parsedLimit - 1].created_at : null

    return c.json({ orderId, events, nextCursor })
  },
)

// ── GET /api/orders/:id/timeline ──────────────────────────────────────────────
// Milestone-only view derived from order.status_changed events.
// Auth: public (tracking token path handled upstream) or authenticated.

d3.get('/api/orders/:id/timeline', async (c) => {
  const orderId = c.req.param('id')

  // Check auth header — accept unauthenticated for public tracking usage
  // (the tracking token lives in the URL; this endpoint is order-ID based so
  //  the caller should at minimum have a valid JWT or be going via /track/:token)
  const authHeader = c.req.header('Authorization')
  if (!authHeader) {
    // Public access — verify the order exists before returning
    const order = await c.env.DB.prepare(
      'SELECT id, status FROM orders WHERE id = ? LIMIT 1',
    )
      .bind(orderId)
      .first<{ id: string; status: string }>()

    if (!order) return c.json({ error: 'Order not found' }, 404)
  }

  const order = await c.env.DB.prepare(
    'SELECT id, status FROM orders WHERE id = ? LIMIT 1',
  )
    .bind(orderId)
    .first<{ id: string; status: string }>()

  if (!order) return c.json({ error: 'Order not found' }, 404)

  const { results } = await c.env.DB.prepare(
    `SELECT id, order_id, agent_id, actor_type, event_type, lat, lng, metadata, created_at
     FROM delivery_events
     WHERE order_id = ? AND event_type = 'order.status_changed'
     ORDER BY created_at ASC`,
  )
    .bind(orderId)
    .all<DeliveryEventRow>()

  const milestones = buildTimeline(results, order.status)

  return c.json({ orderId, milestones })
})

// ── GET /api/agents/:id/events ────────────────────────────────────────────────
// Agent activity log for a given day. Admin / dispatcher only.

d3.get(
  '/api/agents/:id/events',
  requireAuth('admin', 'dispatcher'),
  async (c) => {
    const agentId = c.req.param('id')
    const { date, limit = '200' } = c.req.query()

    const parts: string[] = [
      'SELECT id, order_id, agent_id, actor_type, event_type, lat, lng, metadata, created_at',
      'FROM delivery_events',
      'WHERE agent_id = ?',
    ]
    const params: unknown[] = [agentId]

    if (date) {
      parts.push('AND DATE(created_at) = ?')
      params.push(date)
    }

    const parsedLimit = Math.min(parseInt(limit) || 200, 500)
    parts.push(`ORDER BY created_at DESC LIMIT ${parsedLimit}`)

    const { results } = await c.env.DB.prepare(parts.join(' '))
      .bind(...params)
      .all<DeliveryEventRow>()

    const events = results.map((e) => ({
      id: e.id,
      orderId: e.order_id,
      actorType: e.actor_type,
      eventType: e.event_type,
      lat: e.lat,
      lng: e.lng,
      metadata: safeParseJson(e.metadata),
      createdAt: e.created_at,
    }))

    return c.json({ agentId, events })
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

export default d3
