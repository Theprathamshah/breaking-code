// ── D3 — Delivery Events & Audit Domain — Types ───────────────────────────────

export type ActorType = 'system' | 'seller' | 'admin' | 'agent' | 'customer'

export type EventType =
  | 'order.created'
  | 'order.status_changed'
  | 'order.delivered'
  | 'order.failed'
  | 'order.rescheduled'
  | 'agent.assigned'
  | 'route.activated'
  | 'stop.departed'
  | 'stop.arrived'
  | 'agent.gps_ping'
  | 'otp.requested'
  | 'otp.verified'
  | 'otp.failed'
  | 'photo.uploaded'
  | 'feedback.submitted'
  | 'fare.settled'

export interface DeliveryEventRow {
  id: string
  order_id: string
  agent_id: string | null
  actor_type: ActorType
  event_type: EventType
  lat: number | null
  lng: number | null
  metadata: string // JSON
  created_at: string
}

// ── Typed metadata per event ──────────────────────────────────────────────────

export type EventMetadata =
  | { event: 'order.created'; sellerId: string; quotedFare: number }
  | { event: 'order.status_changed'; from: string; to: string; triggeredBy: string }
  | { event: 'agent.assigned'; agentId: string; routeId: string; stopId?: string }
  | { event: 'route.activated'; agentId: string; stopCount: number }
  | { event: 'stop.departed'; etaSeconds: number; trackingToken: string }
  | { event: 'stop.arrived' }
  | { event: 'agent.gps_ping'; speed?: number; heading?: number }
  | { event: 'otp.requested'; expiresAt: string }
  | { event: 'otp.verified' }
  | { event: 'otp.failed'; attempt: number }
  | { event: 'photo.uploaded'; stage: string; r2Key: string }
  | { event: 'order.delivered'; settledFare: number }
  | { event: 'order.failed'; reason: string }
  | { event: 'order.rescheduled'; reason?: string }
  | { event: 'fare.settled'; settledFare: number; partnerPayout: number }
  | { event: 'feedback.submitted'; rating: number; fromActor: ActorType }

// ── Timeline milestone (response shape for GET /api/orders/:id/timeline) ──────

export interface TimelineMilestone {
  status: string
  label: string
  at: string | null
  done: boolean
}

// ── POST /api/events request body ─────────────────────────────────────────────

export interface AppendEventBody {
  orderId: string
  agentId?: string | null
  actorType: ActorType
  eventType: string
  lat?: number | null
  lng?: number | null
  metadata?: Record<string, unknown>
}
