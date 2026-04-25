import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env, QueueMessage } from './types'
import d2Routes from './domains/d2/routes'
import d1Routes from './domains/d1/routes'
import { handleQueue } from './domains/d2/consumer'
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
    allowHeaders: ['Authorization', 'Content-Type', 'X-Api-Key'],
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
app.route('/', d1Routes)

// ── Debug (remove before deploy) ─────────────────────────────────────────────
app.get('/api/me', requireAuth('admin', 'dispatcher', 'agent', 'customer', 'seller'), (c) => {
  return c.json(c.get('auth'))
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
   * Queue consumer — processes `order.created` messages from Domain 1.
   * Triggers OrderLifecycleWorkflow for each order.
   */
  async queue(
    batch: MessageBatch<QueueMessage>,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    return handleQueue(batch, env)
  },
}
