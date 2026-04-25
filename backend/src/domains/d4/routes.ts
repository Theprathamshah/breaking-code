import { Hono } from 'hono'
import type { Env, HonoVariables, AuthContext } from '../../types'
import { requireAuth } from '../../middleware/auth'
import { hmacSHA256 } from '../../middleware/auth'
import { logEvent } from '../d3/lib/logger'
import { sendCustomerWhatsAppMessage } from './lib/gupshup'
import type { OtpVerifyBody, FailStopBody, StopRow } from './types'

const d4 = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve agent DB row from Clerk userId. */
async function resolveAgent(
  db: Env['DB'],
  clerkUserId: string,
  tenantId: string,
): Promise<{ id: string; commission_pct: number } | null> {
  return db
    .prepare(
      'SELECT id, commission_pct FROM delivery_agents WHERE clerk_user_id = ? AND tenant_id = ? LIMIT 1',
    )
    .bind(clerkUserId, tenantId)
    .first<{ id: string; commission_pct: number }>()
}

/** Load stop + order for a given stopId + routeId, asserting agent ownership. */
async function loadStop(
  db: Env['DB'],
  routeId: string,
  stopId: string,
  tenantId: string,
  agentDbId: string,
): Promise<StopRow | null> {
  const route = await db
    .prepare(
      "SELECT id, agent_id FROM routes WHERE id = ? AND tenant_id = ? AND status = 'active' LIMIT 1",
    )
    .bind(routeId, tenantId)
    .first<{ id: string; agent_id: string | null }>()

  if (!route || route.agent_id !== agentDbId) return null

  return db
    .prepare(
      `SELECT
         rs.id AS stop_id, rs.route_id, rs.order_id, rs.status,
         r.agent_id,
         o.otp_code_hash, o.customer_phone, o.customer_name, o.tracking_token,
         rs.distance_from_prev_km
       FROM route_stops rs
       JOIN routes r ON r.id = rs.route_id
       JOIN orders o ON o.id = rs.order_id
       WHERE rs.id = ? AND rs.route_id = ?
       LIMIT 1`,
    )
    .bind(stopId, routeId)
    .first<StopRow>()
}

// ── PATCH /api/routes/:id/stops/:stopId/arrive ────────────────────────────────
// Agent taps "I've arrived". Transitions stop → arrived.

d4.patch(
  '/api/routes/:id/stops/:stopId/arrive',
  requireAuth('admin', 'dispatcher', 'agent'),
  async (c) => {
    const auth = c.get('auth') as AuthContext
    const routeId = c.req.param('id') as string
    const stopId = c.req.param('stopId') as string

    const agent = await resolveAgent(c.env.DB, auth.userId, auth.orgId)
    if (!agent) return c.json({ error: 'Agent not found' }, 404)

    const stop = await loadStop(c.env.DB, routeId, stopId, auth.orgId, agent.id)
    if (!stop) return c.json({ error: 'Stop not found or forbidden' }, 404)

    if (stop.status !== 'heading_to') {
      return c.json({ error: `Stop must be in heading_to state, got: ${stop.status}` }, 409)
    }

    await c.env.DB.prepare(
      "UPDATE route_stops SET status = 'arrived', actual_arrival_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    )
      .bind(stopId)
      .run()

    await logEvent(c.env.DB, {
      orderId: stop.order_id,
      agentId: agent.id,
      actorType: 'agent',
      eventType: 'stop.arrived',
    })

    return c.json({ success: true, stopId, orderId: stop.order_id })
  },
)

// ── POST /api/routes/:id/stops/:stopId/otp/request ───────────────────────────
// Generate OTP, store hash, "send" to customer.

d4.post(
  '/api/routes/:id/stops/:stopId/otp/request',
  requireAuth('admin', 'dispatcher', 'agent'),
  async (c) => {
    const auth = c.get('auth') as AuthContext
    const routeId = c.req.param('id') as string
    const stopId = c.req.param('stopId') as string

    const agent = await resolveAgent(c.env.DB, auth.userId, auth.orgId)
    if (!agent) return c.json({ error: 'Agent not found' }, 404)

    const stop = await loadStop(c.env.DB, routeId, stopId, auth.orgId, agent.id)
    if (!stop) return c.json({ error: 'Stop not found or forbidden' }, 404)

    if (stop.status !== 'arrived') {
      return c.json({ error: `Stop must be in arrived state, got: ${stop.status}` }, 409)
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000))).padStart(6, '0')
    const otpHash = await hmacSHA256(c.env.HMAC_SECRET, `${otp}:${stop.order_id}`)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    // Store hash + clear any old hash
    await c.env.DB.prepare(
      "UPDATE orders SET otp_code_hash = ?, updated_at = datetime('now') WHERE id = ?",
    )
      .bind(otpHash, stop.order_id)
      .run()

    // Log customer comms (mock send)
    const otpMessage = `Your delivery OTP for ${stop.customer_name} is ${otp}. Share it only with the delivery agent.`
    const otpSent = await sendCustomerWhatsAppMessage(c.env, {
      phone: stop.customer_phone,
      text: otpMessage,
    })

    await c.env.DB.prepare(
      "INSERT INTO customer_comms (id, order_id, channel, event_type, recipient, status) VALUES (?, ?, 'whatsapp', 'otp.requested', ?, ?)",
    )
      .bind(`comm_${Date.now()}`, stop.order_id, stop.customer_phone ?? 'unknown', otpSent ? 'sent' : 'failed')
      .run()

    await logEvent(c.env.DB, {
      orderId: stop.order_id,
      agentId: agent.id,
      actorType: 'agent',
      eventType: 'otp.requested',
      metadata: { expiresAt },
    })

    // In dev, expose OTP in response. In prod, OTP goes to customer's phone only.
    const isDev = c.env.ENVIRONMENT === 'development'

    return c.json({
      success: true,
      otpSentTo: stop.customer_phone ?? 'N/A',
      ...(isDev ? { __dev_otp: otp } : {}),
    })
  },
)

// ── POST /api/routes/:id/stops/:stopId/otp/verify ────────────────────────────
// Verify OTP. On match → deliver order, publish queue, settle fare.

d4.post(
  '/api/routes/:id/stops/:stopId/otp/verify',
  requireAuth('admin', 'dispatcher', 'agent'),
  async (c) => {
    const auth = c.get('auth') as AuthContext
    const routeId = c.req.param('id') as string
    const stopId = c.req.param('stopId') as string
    const body = await c.req.json<OtpVerifyBody>().catch(() => null)

    if (!body?.otp) return c.json({ error: 'otp is required' }, 400)

    const agent = await resolveAgent(c.env.DB, auth.userId, auth.orgId)
    if (!agent) return c.json({ error: 'Agent not found' }, 404)

    const stop = await loadStop(c.env.DB, routeId, stopId, auth.orgId, agent.id)
    if (!stop) return c.json({ error: 'Stop not found or forbidden' }, 404)

    if (stop.status !== 'arrived') {
      return c.json({ error: `Stop must be in arrived state, got: ${stop.status}` }, 409)
    }

    if (!stop.otp_code_hash) {
      return c.json({ error: 'No OTP requested for this stop. Call /otp/request first.' }, 409)
    }

    // Verify
    const inputHash = await hmacSHA256(c.env.HMAC_SECRET, `${body.otp}:${stop.order_id}`)
    if (inputHash !== stop.otp_code_hash) {
      // Log failed attempt — count attempts from recent otp.failed events
      const { results: failEvents } = await c.env.DB.prepare(
        "SELECT COUNT(*) as n FROM delivery_events WHERE order_id = ? AND event_type = 'otp.failed'",
      )
        .bind(stop.order_id)
        .all<{ n: number }>()
      const attempt = (failEvents[0]?.n ?? 0) + 1

      await logEvent(c.env.DB, {
        orderId: stop.order_id,
        agentId: agent.id,
        actorType: 'agent',
        eventType: 'otp.failed',
        metadata: { attempt },
      })

      return c.json({ success: false, message: 'OTP incorrect', attempt })
    }

    // ── OTP matched — complete delivery ──────────────────────────────────────

    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE route_stops SET status = 'delivered', actual_departure_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      ).bind(stopId),
      c.env.DB.prepare(
        "UPDATE orders SET status = 'delivered', otp_code_hash = NULL, updated_at = datetime('now') WHERE id = ?",
      ).bind(stop.order_id),
    ])

    // KV: mark tracking as done
    await c.env.KV.put(`tracking:${stop.order_id}`, 'done')

    // Close customer WebSockets via DO
    try {
      const doId = c.env.DELIVERY_SESSION_DO.idFromName(agent.id)
      const doStub = c.env.DELIVERY_SESSION_DO.get(doId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (doStub as any).closeOrderSockets(stop.order_id, 'delivered')
    } catch {
      // DO may not be active — ignore
    }

    // Publish delivery event → D5 consumer will settle fare
    await c.env.QUEUE_ORDER_DELIVERED.send({
      type: 'order.delivered',
      orderId: stop.order_id,
      agentId: agent.id,
      stopId,
      settledFare: 0, // D5 recalculates from actual distance
    })

    const deliveredSent = await sendCustomerWhatsAppMessage(c.env, {
      phone: stop.customer_phone,
      text: `Your order for ${stop.customer_name} has been delivered successfully.`,
    })

    await c.env.DB.prepare(
      "INSERT INTO customer_comms (id, order_id, channel, event_type, recipient, status) VALUES (?, ?, 'whatsapp', 'order.delivered', ?, ?)",
    )
      .bind(`comm_${Date.now()}`, stop.order_id, stop.customer_phone ?? 'unknown', deliveredSent ? 'sent' : 'failed')
      .run()

    // Log events
    await Promise.all([
      logEvent(c.env.DB, {
        orderId: stop.order_id,
        agentId: agent.id,
        actorType: 'agent',
        eventType: 'otp.verified',
      }),
      logEvent(c.env.DB, {
        orderId: stop.order_id,
        agentId: agent.id,
        actorType: 'system',
        eventType: 'order.status_changed',
        metadata: { from: 'in_transit', to: 'delivered', triggeredBy: 'otp.verified' },
      }),
      logEvent(c.env.DB, {
        orderId: stop.order_id,
        agentId: agent.id,
        actorType: 'system',
        eventType: 'order.delivered',
        metadata: { stopId, commissionPct: agent.commission_pct },
      }),
    ])

    return c.json({ success: true, orderId: stop.order_id, status: 'delivered' })
  },
)

// ── POST /api/routes/:id/stops/:stopId/fail ───────────────────────────────────
// Mark stop as failed.

d4.post(
  '/api/routes/:id/stops/:stopId/fail',
  requireAuth('admin', 'dispatcher', 'agent'),
  async (c) => {
    const auth = c.get('auth') as AuthContext
    const routeId = c.req.param('id') as string
    const stopId = c.req.param('stopId') as string
    const body = await c.req.json<FailStopBody>().catch(() => null)

    if (!body?.reason) return c.json({ error: 'reason is required' }, 400)

    const agent = await resolveAgent(c.env.DB, auth.userId, auth.orgId)
    if (!agent) return c.json({ error: 'Agent not found' }, 404)

    const stop = await loadStop(c.env.DB, routeId, stopId, auth.orgId, agent.id)
    if (!stop) return c.json({ error: 'Stop not found or forbidden' }, 404)

    if (!['heading_to', 'arrived'].includes(stop.status)) {
      return c.json({ error: `Cannot fail a stop in ${stop.status} state` }, 409)
    }

    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE route_stops SET status = 'failed', failure_reason = ?, actual_departure_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      ).bind(body.reason, stopId),
      c.env.DB.prepare(
        "UPDATE orders SET status = 'failed', otp_code_hash = NULL, updated_at = datetime('now') WHERE id = ?",
      ).bind(stop.order_id),
    ])

    // KV: mark tracking as done
    await c.env.KV.put(`tracking:${stop.order_id}`, 'done')

    // Close customer WebSockets
    try {
      const doId = c.env.DELIVERY_SESSION_DO.idFromName(agent.id)
      const doStub = c.env.DELIVERY_SESSION_DO.get(doId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (doStub as any).closeOrderSockets(stop.order_id, 'failed')
    } catch {
      // DO may not be active — ignore
    }

    await c.env.QUEUE_ORDER_FAILED.send({
      type: 'order.failed',
      orderId: stop.order_id,
      agentId: agent.id,
      stopId,
      reason: body.reason,
    })

    const failedSent = await sendCustomerWhatsAppMessage(c.env, {
      phone: stop.customer_phone,
      text: `We could not complete delivery for ${stop.customer_name}. Reason: ${body.reason}`,
    })

    await c.env.DB.prepare(
      "INSERT INTO customer_comms (id, order_id, channel, event_type, recipient, status) VALUES (?, ?, 'whatsapp', 'order.failed', ?, ?)",
    )
      .bind(`comm_${Date.now()}`, stop.order_id, stop.customer_phone ?? 'unknown', failedSent ? 'sent' : 'failed')
      .run()

    await Promise.all([
      logEvent(c.env.DB, {
        orderId: stop.order_id,
        agentId: agent.id,
        actorType: 'system',
        eventType: 'order.status_changed',
        metadata: { from: stop.status, to: 'failed', triggeredBy: 'agent.fail' },
      }),
      logEvent(c.env.DB, {
        orderId: stop.order_id,
        agentId: agent.id,
        actorType: 'system',
        eventType: 'order.failed',
        metadata: { reason: body.reason, stopId },
      }),
    ])

    return c.json({ success: true, orderId: stop.order_id, status: 'failed' })
  },
)

// ── POST /api/orders/:orderId/photos ─────────────────────────────────────────
// Upload a photo to R2. Multipart form-data.

d4.post('/api/orders/:orderId/photos', requireAuth('admin', 'dispatcher', 'agent'), async (c) => {
  const auth = c.get('auth') as AuthContext
  const orderId = c.req.param('orderId') as string

  // Verify order exists and belongs to tenant
  const order = await c.env.DB.prepare(
    'SELECT id FROM orders WHERE id = ? AND tenant_id = ? LIMIT 1',
  )
    .bind(orderId, auth.orgId)
    .first<{ id: string }>()

  if (!order) return c.json({ error: 'Order not found' }, 404)

  let file: File | null = null
  let stage = 'pod'

  try {
    const formData = await c.req.formData()
    file = formData.get('file') as File | null
    stage = (formData.get('stage') as string) ?? 'pod'
  } catch {
    return c.json({ error: 'Expected multipart/form-data with a "file" field' }, 400)
  }

  if (!file) return c.json({ error: '"file" field is required' }, 400)

  const validStages = ['pre_delivery', 'open_box', 'pod']
  if (!validStages.includes(stage)) {
    return c.json({ error: `stage must be one of: ${validStages.join(', ')}` }, 400)
  }

  const r2Key = `photos/${auth.orgId}/${orderId}/${stage}/${Date.now()}.jpg`
  await c.env.STORAGE.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || 'image/jpeg' },
  })

  // Resolve agent for event log
  const agent = await resolveAgent(c.env.DB, auth.userId, auth.orgId)

  await logEvent(c.env.DB, {
    orderId,
    agentId: agent?.id ?? null,
    actorType: 'agent',
    eventType: 'photo.uploaded',
    metadata: { stage, r2Key },
  })

  return c.json({ r2Key }, 201)
})

// ── GET /ws/agent ─────────────────────────────────────────────────────────────
// WebSocket upgrade: agent GPS feed → Durable Object.
// Auth via ?token= query param (WS handshake headers are limited).

d4.get('/ws/agent', async (c) => {
  const agentId = c.req.query('agentId')
  if (!agentId) return c.json({ error: 'agentId is required' }, 400)

  if (c.req.header('Upgrade') !== 'websocket') {
    return c.json({ error: 'WebSocket upgrade required' }, 426)
  }

  const doId = c.env.DELIVERY_SESSION_DO.idFromName(agentId)
  const doStub = c.env.DELIVERY_SESSION_DO.get(doId)

  const url = new URL(c.req.url)
  url.searchParams.set('type', 'agent')

  return doStub.fetch(new Request(url.toString(), c.req.raw))
})

// ── GET /ws/customer ──────────────────────────────────────────────────────────
// WebSocket upgrade: customer live tracking. Public (token validated via tracking_token).

d4.get('/ws/customer', async (c) => {
  const orderId = c.req.query('orderId')
  const agentId = c.req.query('agentId')

  if (!orderId || !agentId) return c.json({ error: 'orderId and agentId are required' }, 400)

  if (c.req.header('Upgrade') !== 'websocket') {
    return c.json({ error: 'WebSocket upgrade required' }, 426)
  }

  const doId = c.env.DELIVERY_SESSION_DO.idFromName(agentId)
  const doStub = c.env.DELIVERY_SESSION_DO.get(doId)

  const url = new URL(c.req.url)
  url.searchParams.set('type', 'customer')

  return doStub.fetch(new Request(url.toString(), c.req.raw))
})

// ── GET /track/:token ─────────────────────────────────────────────────────────
// Public tracking endpoint. No auth required.

d4.get('/track/:token', async (c) => {
  const token = c.req.param('token')

  const order = await c.env.DB.prepare(
    `SELECT
       o.id, o.status, o.customer_name, o.address, o.tracking_token,
       o.hub_id,
       rs.eta, rs.status AS stop_status,
       r.agent_id,
       da.name AS agent_name, da.photo_url AS agent_photo
     FROM orders o
     LEFT JOIN route_stops rs ON rs.order_id = o.id AND rs.status IN ('heading_to','arrived')
     LEFT JOIN routes r ON r.id = rs.route_id
     LEFT JOIN delivery_agents da ON da.id = r.agent_id
     WHERE o.tracking_token = ?
     ORDER BY rs.sequence_no ASC
     LIMIT 1`,
  )
    .bind(token)
    .first<{
      id: string
      status: string
      customer_name: string
      address: string
      tracking_token: string
      hub_id: string | null
      eta: string | null
      stop_status: string | null
      agent_id: string | null
      agent_name: string | null
      agent_photo: string | null
    }>()

  if (!order) return c.json({ error: 'Tracking token not found' }, 404)

  // Tracking mode from KV
  const mode = (await c.env.KV.get(`tracking:${order.id}`)) ?? 'milestone'

  // Status timeline from delivery_events
  const { results: statusEvents } = await c.env.DB.prepare(
    `SELECT metadata, created_at
     FROM delivery_events
     WHERE order_id = ? AND event_type = 'order.status_changed'
     ORDER BY created_at ASC`,
  )
    .bind(order.id)
    .all<{ metadata: string; created_at: string }>()

  const statusTimeline = statusEvents.map((e) => {
    const meta = safeParseJson(e.metadata)
    return { status: meta.to as string, ts: e.created_at }
  })

  return c.json({
    mode: mode === 'live' ? 'live' : 'milestone',
    order: {
      id: order.id,
      status: order.status,
      customerName: order.customer_name,
      address: order.address,
      trackingToken: order.tracking_token,
    },
    ...(order.agent_id
      ? {
          agentId: order.agent_id,
          agentName: order.agent_name,
          agentPhoto: order.agent_photo,
          eta: order.eta,
        }
      : {}),
    statusTimeline,
  })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

export default d4
