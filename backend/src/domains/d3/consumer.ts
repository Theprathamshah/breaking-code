import type { Env, QueueMessage } from '../../types'
import { nanoid } from '../../lib/nanoid'

/**
 * D3 Queue consumer.
 *
 * Receives all domain events published by D1, D2, and D4 via their respective
 * queues. Each message is written as an immutable row in `delivery_events`.
 * Uses DB.batch() for one round-trip, then acks messages individually so we
 * don't accidentally ack messages from other consumers.
 */
export async function handleD3Queue(
  messages: Message<QueueMessage>[],
  env: Env,
): Promise<void> {
  if (messages.length === 0) return
  const stmts = messages.map((msg) => buildInsertStmt(env.DB, msg.body))
  await env.DB.batch(stmts)
  messages.forEach((msg) => msg.ack())
}

function buildInsertStmt(db: D1Database, msg: QueueMessage): D1PreparedStatement {
  const id = `evt_${nanoid()}`
  const { actorType, agentId, meta } = extractFields(msg)

  return db
    .prepare(
      `INSERT INTO delivery_events
         (id, order_id, agent_id, actor_type, event_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, orderId(msg), agentId, actorType, msg.type, JSON.stringify(meta))
}

// ── Field extraction per message type ────────────────────────────────────────

function orderId(msg: QueueMessage): string {
  if ('orderId' in msg) return msg.orderId
  // route.activated has no orderId — use routeId as placeholder
  if (msg.type === 'route.activated') return msg.routeId
  return ''
}

function extractFields(msg: QueueMessage): {
  actorType: string
  agentId: string | null
  meta: Record<string, unknown>
} {
  switch (msg.type) {
    case 'order.created':
      return {
        actorType: 'system',
        agentId: null,
        meta: { tenantId: msg.tenantId, hubId: msg.hubId },
      }

    case 'agent.assigned':
      return {
        actorType: 'system',
        agentId: msg.agentId,
        meta: { agentId: msg.agentId, routeId: msg.routeId, stopId: msg.stopId },
      }

    case 'route.activated':
      return {
        actorType: 'system',
        agentId: msg.agentId,
        meta: { agentId: msg.agentId, hubId: msg.hubId, stopCount: msg.stopCount },
      }

    case 'stop.departed':
      return {
        actorType: 'agent',
        agentId: msg.agentId,
        meta: { etaSeconds: msg.etaSeconds, trackingToken: msg.trackingToken },
      }

    case 'order.delivered':
      return {
        actorType: 'system',
        agentId: msg.agentId,
        meta: { settledFare: msg.settledFare, stopId: msg.stopId },
      }

    case 'order.failed':
      return {
        actorType: 'system',
        agentId: msg.agentId,
        meta: { reason: msg.reason, stopId: msg.stopId },
      }

    default:
      return { actorType: 'system', agentId: null, meta: {} }
  }
}
