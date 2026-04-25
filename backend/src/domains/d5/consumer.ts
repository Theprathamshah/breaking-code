import type { Message } from '@cloudflare/workers-types'
import type { Env, OrderDeliveredMessage } from '../../types'
import { nanoid } from '../../lib/nanoid'
import { getFareConfigCached, computeFare } from './fare'
import { logEvent } from '../d3/lib/logger'

/**
 * D5 Queue Consumer — handles order.delivered messages.
 * Settles fare and creates partner_earnings record.
 */
export async function handleD5Queue(
  messages: Message<OrderDeliveredMessage>[],
  env: Env,
): Promise<void> {
  for (const msg of messages) {
    try {
      await settleFare(env, msg.body.orderId, msg.body.agentId)
      msg.ack()
    } catch (err) {
      console.error('[D5] settleFare failed', msg.body.orderId, err)
      msg.retry()
    }
  }
}

async function settleFare(env: Env, orderId: string, agentId: string): Promise<void> {
  // Load order + agent commission
  const order = await env.DB.prepare(
    `SELECT o.id, o.tenant_id, o.parcel_weight, o.delivery_window_start, o.delivery_window_end,
            da.commission_pct
     FROM orders o
     JOIN delivery_agents da ON da.id = ?
     WHERE o.id = ?
     LIMIT 1`,
  )
    .bind(agentId, orderId)
    .first<{
      id: string
      tenant_id: string
      parcel_weight: number
      delivery_window_start: string | null
      delivery_window_end: string | null
      commission_pct: number
    }>()

  if (!order) return

  // Load actual distance from the delivered stop
  const stop = await env.DB.prepare(
    "SELECT distance_from_prev_km FROM route_stops WHERE order_id = ? AND status = 'delivered' LIMIT 1",
  )
    .bind(orderId)
    .first<{ distance_from_prev_km: number }>()

  const distanceKm = stop?.distance_from_prev_km ?? 3 // fallback to 3km if no stop found

  // Load fare config
  const config = await getFareConfigCached(env.KV, env.DB, order.tenant_id)
  if (!config) return

  // Compute settled fare
  const breakdown = computeFare({
    config,
    distanceKm,
    weightKg: order.parcel_weight,
    deliveryWindowStart: order.delivery_window_start,
    deliveryWindowEnd: order.delivery_window_end,
  })

  const settledFare = breakdown.total
  const partnerPayout = Math.round(settledFare * (order.commission_pct / 100) * 100) / 100
  const platformCut = Math.round((settledFare - partnerPayout) * 100) / 100

  // Upsert order_fares
  const fareId = `fare_${nanoid()}`
  await env.DB.prepare(
    `INSERT INTO order_fares (id, order_id, quoted_fare, settled_fare, distance_km, breakdown, status, settled_at)
     VALUES (?, ?, ?, ?, ?, ?, 'settled', datetime('now'))
     ON CONFLICT(order_id) DO UPDATE SET
       settled_fare = excluded.settled_fare,
       distance_km  = excluded.distance_km,
       breakdown    = excluded.breakdown,
       status       = 'settled',
       settled_at   = datetime('now')`,
  )
    .bind(
      fareId,
      orderId,
      breakdown.total, // quoted_fare = settled when no prior quote
      settledFare,
      distanceKm,
      JSON.stringify(breakdown),
    )
    .run()

  // Insert partner_earnings
  const earnId = `earn_${nanoid()}`
  await env.DB.prepare(
    `INSERT OR IGNORE INTO partner_earnings
       (id, agent_id, order_id, gross_fare, commission_pct, partner_payout, platform_cut)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(earnId, agentId, orderId, settledFare, order.commission_pct, partnerPayout, platformCut)
    .run()

  // Log fare.settled event
  await logEvent(env.DB, {
    orderId,
    agentId,
    actorType: 'system',
    eventType: 'fare.settled',
    metadata: { settledFare, partnerPayout, commissionPct: order.commission_pct },
  })
}
