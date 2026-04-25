import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env, QueueMessage } from './types'
import d2Routes from './domains/d2/routes'
import d3Routes from './domains/d3/routes'
import { handleQueue } from './domains/d2/consumer'
import { handleD3Queue } from './domains/d3/consumer'
import { requireAuth } from './middleware/auth'

// ── Re-export CF class bindings ───────────────────────────────────────────────
// Wrangler requires these to be named exports from the Worker entry point.

export { OrderLifecycleWorkflow } from './domains/d2/workflow'
export { DeliverySessionDO } from './domains/d4/durable-object'

// ── Hono app ──────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>()

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type', 'X-Api-Key', 'X-Internal-Token'],
  }),
)

app.get('/', (c) =>
  c.json({
    service: 'breaking-code-backend',
    version: '1.0.0',
    env: c.env.ENVIRONMENT,
  }),
)

// ── Domain 2 — Dispatch & Route Ops ──────────────────────────────────────────
app.route('/', d2Routes)

// ── Domain 3 — Delivery Events & Audit ───────────────────────────────────────
app.route('/', d3Routes)

// ── Debug (remove before deploy) ─────────────────────────────────────────────
app.get('/api/me', requireAuth('admin', 'dispatcher', 'agent', 'customer'), (c) => {
  return c.json(c.get('auth'))
})

// ── Domain 1 stub — Orders (read-only until D1 is implemented) ────────────────
app.get('/api/orders', requireAuth('admin', 'dispatcher', 'agent'), async (c) => {
  const auth = c.get('auth') as import('./types').AuthContext
  const { status, hubId, limit = '50' } = c.req.query()

  const parts = ['SELECT * FROM orders WHERE tenant_id = ?']
  const params: unknown[] = [auth.orgId]

  if (status)  { parts.push('AND status = ?');  params.push(status) }
  if (hubId)   { parts.push('AND hub_id = ?');  params.push(hubId) }
  parts.push(`ORDER BY created_at DESC LIMIT ${parseInt(limit) || 50}`)

  const { results } = await c.env.DB.prepare(parts.join(' ')).bind(...params).all()
  return c.json({ orders: results })
})

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'Not found' }, 404))

// ── Error handler ─────────────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error('[Worker error]', err)
  return c.json({ error: 'Internal server error' }, 500)
})

// ── Worker export ─────────────────────────────────────────────────────────────

export default {
  /**
   * HTTP fetch handler — all REST + WebSocket routes.
   */
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(req, env, ctx)
  },

  /**
   * Queue consumer — D2 handles `order.created` (triggers Workflow).
   * D3 handles all other event types (writes to delivery_events).
   */
  async queue(
    batch: MessageBatch<QueueMessage>,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    // Route by message type: order.created → D2 (triggers Workflow),
    // everything else → D3 (writes delivery_events immutable log)
    const d2Messages = batch.messages.filter((m) => m.body.type === 'order.created')
    const d3Messages = batch.messages.filter((m) => m.body.type !== 'order.created')

    // Run both concurrently — they write to different tables
    await Promise.all([
      d2Messages.length > 0
        ? handleQueue({ ...batch, messages: d2Messages }, env)
        : Promise.resolve(),
      d3Messages.length > 0
        ? handleD3Queue(d3Messages, env)
        : Promise.resolve(),
    ])
  },
}
