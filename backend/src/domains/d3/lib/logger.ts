import type { D1Database } from '@cloudflare/workers-types'
import { nanoid } from '../../../lib/nanoid'

interface LogEventParams {
  orderId: string
  agentId?: string | null
  actorType: 'system' | 'seller' | 'admin' | 'agent' | 'customer'
  eventType: string
  lat?: number | null
  lng?: number | null
  metadata?: Record<string, unknown>
}

/**
 * Shared helper — inserts a single delivery_event row.
 * Imported by D4 and D5 so they don't need an HTTP round-trip to POST /api/events.
 */
export async function logEvent(db: D1Database, params: LogEventParams): Promise<string> {
  const eventId = `evt_${nanoid()}`

  await db
    .prepare(
      `INSERT INTO delivery_events
         (id, order_id, agent_id, actor_type, event_type, lat, lng, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      eventId,
      params.orderId,
      params.agentId ?? null,
      params.actorType,
      params.eventType,
      params.lat ?? null,
      params.lng ?? null,
      JSON.stringify(params.metadata ?? {}),
    )
    .run()

  return eventId
}
