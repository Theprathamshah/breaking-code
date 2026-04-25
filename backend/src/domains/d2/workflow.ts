import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers'
import type { Env, Order, Hub, DeliveryAgent } from '../../types'
import { optimizeRoute, computeETAs, haversine } from './optimizer'
import { nanoid } from '../../lib/nanoid'

// ── Workflow params ───────────────────────────────────────────────────────────

export interface OrderLifecycleParams {
  orderId: string
  tenantId: string
  hubId: string
}

// ── Workflow ──────────────────────────────────────────────────────────────────

/**
 * OrderLifecycleWorkflow
 *
 * Triggered by the `order.created` queue consumer for every new order.
 * Steps (each is durable — survives Worker restarts):
 *   1. Load order + hub from D1
 *   2. Mark order → confirmed
 *   3. Find best available agent at hub
 *   4. Find or create today's route for that agent
 *   5. Add the order as a route stop
 *   6. Re-optimise the full route (nearest-neighbour TSP)
 *   7. Cache per-stop ETAs in KV
 *   8. Mark order → packed
 *   9. Publish agent.assigned queue event
 */
export class OrderLifecycleWorkflow extends WorkflowEntrypoint<Env, OrderLifecycleParams> {
  async run(event: WorkflowEvent<OrderLifecycleParams>, step: WorkflowStep) {
    const { orderId, tenantId, hubId } = event.payload

    // ── Step 1: Load order + hub ────────────────────────────────────────────
    const { order, hub } = await step.do('load-order-and-hub', async () => {
      const order = await this.env.DB.prepare(
        'SELECT * FROM orders WHERE id = ? AND tenant_id = ?',
      )
        .bind(orderId, tenantId)
        .first<Order>()

      if (!order) throw new Error(`Order ${orderId} not found`)

      const hub = await this.env.DB.prepare('SELECT * FROM hubs WHERE id = ?')
        .bind(hubId)
        .first<Hub>()

      if (!hub) throw new Error(`Hub ${hubId} not found`)

      return { order, hub }
    })

    // ── Step 2: Confirm order ───────────────────────────────────────────────
    await step.do('confirm-order', async () => {
      await this.env.DB.prepare(
        "UPDATE orders SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?",
      )
        .bind(orderId)
        .run()
    })

    // ── Step 3: Find best available agent ───────────────────────────────────
    const agent = await step.do('find-agent', async () => {
      const { results } = await this.env.DB.prepare(
        `SELECT id, name, current_lat, current_lng
         FROM delivery_agents
         WHERE hub_id = ? AND tenant_id = ? AND status = 'available'
         ORDER BY last_seen_at DESC
         LIMIT 10`,
      )
        .bind(hubId, tenantId)
        .all<Pick<DeliveryAgent, 'id' | 'name' | 'current_lat' | 'current_lng'>>()

      if (results.length === 0) return null

      // Prefer agent closest to hub (by GPS); fall back to most-recently-seen
      const withGPS = results.filter((a) => a.current_lat !== null && a.current_lng !== null)
      if (withGPS.length === 0) return results[0]

      return withGPS.reduce((best, a) => {
        const d = haversine(hub.lat, hub.lng, a.current_lat!, a.current_lng!)
        const bd = haversine(hub.lat, hub.lng, best.current_lat!, best.current_lng!)
        return d < bd ? a : best
      })
    })

    // If no agent is free, re-enqueue for retry (Workflow will auto-retry on error,
    // but we want a deliberate delay so we just send back to queue)
    if (!agent) {
      await step.do('no-agent-requeue', async () => {
        await this.env.QUEUE_ORDER_CREATED.send({
          type: 'order.created',
          orderId,
          tenantId,
          hubId,
          createdAt: new Date().toISOString(),
        })
      })
      return
    }

    // ── Step 4: Find or create today's route for this agent ─────────────────
    const routeId = await step.do('find-or-create-route', async () => {
      const today = new Date().toISOString().slice(0, 10)

      const existing = await this.env.DB.prepare(
        `SELECT id FROM routes
         WHERE agent_id = ? AND date = ? AND status IN ('planned','active')
         LIMIT 1`,
      )
        .bind(agent.id, today)
        .first<{ id: string }>()

      if (existing) return existing.id

      const id = `route_${nanoid()}`
      await this.env.DB.prepare(
        `INSERT INTO routes
           (id, tenant_id, agent_id, hub_id, date, status, optimized_sequence)
         VALUES (?, ?, ?, ?, ?, 'planned', '[]')`,
      )
        .bind(id, tenantId, agent.id, hubId, today)
        .run()

      return id
    })

    // ── Step 5: Add stop to route ────────────────────────────────────────────
    const stopId = await step.do('add-stop', async () => {
      const cnt = await this.env.DB.prepare(
        'SELECT COUNT(*) as n FROM route_stops WHERE route_id = ?',
      )
        .bind(routeId)
        .first<{ n: number }>()

      const seqNo = (cnt?.n ?? 0) + 1
      const id = `stop_${nanoid()}`

      await this.env.DB.prepare(
        `INSERT INTO route_stops (id, route_id, order_id, sequence_no, status)
         VALUES (?, ?, ?, ?, 'pending')`,
      )
        .bind(id, routeId, orderId, seqNo)
        .run()

      return id
    })

    // ── Step 6: Re-optimise route ────────────────────────────────────────────
    await step.do('optimise-route', async () => {
      const { results: stops } = await this.env.DB.prepare(
        `SELECT rs.id, o.lat, o.lng
         FROM route_stops rs
         JOIN orders o ON o.id = rs.order_id
         WHERE rs.route_id = ? AND rs.status = 'pending'`,
      )
        .bind(routeId)
        .all<{ id: string; lat: number; lng: number }>()

      if (stops.length === 0) return

      const optimized = optimizeRoute(hub.lat, hub.lng, stops)

      // Default route start time: today 9:00 AM UTC
      const today = new Date().toISOString().slice(0, 10)
      const startTime = new Date(`${today}T09:00:00.000Z`)
      const etas = computeETAs(startTime, optimized)

      // Batch-update sequence_no, distance, eta per stop
      const statements = optimized.sequence.map((sid, idx) => {
        const eta = etas.get(sid)?.toISOString() ?? null
        const dist = optimized.segmentDistances[idx]
        return this.env.DB.prepare(
          `UPDATE route_stops
           SET sequence_no = ?, distance_from_prev_km = ?, eta = ?, updated_at = datetime('now')
           WHERE id = ?`,
        ).bind(idx + 1, dist, eta, sid)
      })

      await this.env.DB.batch(statements)

      // Update route totals
      await this.env.DB.prepare(
        `UPDATE routes
         SET optimized_sequence = ?, total_distance_km = ?, estimated_duration_mins = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(
          JSON.stringify(optimized.sequence),
          optimized.totalDistanceKm,
          optimized.estimatedDurationMins,
          routeId,
        )
        .run()

      // Cache ETAs in KV (TTL 10 min) keyed by stop ID
      const kvWrites = optimized.sequence.map((sid) => {
        const eta = etas.get(sid)?.toISOString()
        return this.env.KV.put(`eta:stop:${sid}`, JSON.stringify({ eta, routeId }), {
          expirationTtl: 600,
        })
      })
      await Promise.all(kvWrites)
    })

    // ── Step 7: Mark packed ──────────────────────────────────────────────────
    await step.do('mark-packed', async () => {
      await this.env.DB.prepare(
        "UPDATE orders SET status = 'packed', updated_at = datetime('now') WHERE id = ?",
      )
        .bind(orderId)
        .run()
    })

    // ── Step 8: Publish agent.assigned ───────────────────────────────────────
    await step.do('publish-assigned', async () => {
      await this.env.QUEUE_AGENT_ASSIGNED.send({
        type: 'agent.assigned',
        orderId,
        agentId: agent.id,
        routeId,
        stopId,
      })
    })
  }
}
