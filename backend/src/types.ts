// ── Cloudflare Env ──────────────────────────────────────────────────────────

export interface Env {
  // D1 — primary relational DB
  DB: D1Database

  // KV — tracking_mode flags, ETA cache, JWKS cache
  KV: KVNamespace

  // Workers AI — ETA prediction
  AI: Ai

  // Queues — producers
  QUEUE_ORDER_CREATED: Queue<OrderCreatedMessage>
  QUEUE_AGENT_ASSIGNED: Queue<AgentAssignedMessage>
  QUEUE_ROUTE_ACTIVATED: Queue<RouteActivatedMessage>
  QUEUE_STOP_DEPARTED: Queue<StopDepartedMessage>
  QUEUE_ORDER_DELIVERED: Queue<OrderDeliveredMessage>
  QUEUE_ORDER_FAILED: Queue<OrderFailedMessage>

  // Workflows
  ORDER_LIFECYCLE_WORKFLOW: Workflow

  // R2 — POD photos, agent signatures, bulk CSV storage
  STORAGE: R2Bucket

  // Durable Objects
  DELIVERY_SESSION_DO: DurableObjectNamespace

  // Secrets / vars
  CLERK_JWKS_URL: string
  CLERK_ISSUER: string
  HMAC_SECRET: string
  ENVIRONMENT: string
}

// ── Queue message types ──────────────────────────────────────────────────────

export interface OrderCreatedMessage {
  type: 'order.created'
  orderId: string
  tenantId: string
  hubId: string
  createdAt: string
}

export interface AgentAssignedMessage {
  type: 'agent.assigned'
  orderId: string
  agentId: string
  routeId: string
  stopId: string
}

export interface RouteActivatedMessage {
  type: 'route.activated'
  routeId: string
  agentId: string
  hubId: string
  stopCount: number
}

export interface StopDepartedMessage {
  type: 'stop.departed'
  stopId: string
  orderId: string
  agentId: string
  trackingToken: string
  etaSeconds: number
}

export interface OrderDeliveredMessage {
  type: 'order.delivered'
  orderId: string
  agentId: string
  stopId: string
  settledFare: number
}

export interface OrderFailedMessage {
  type: 'order.failed'
  orderId: string
  agentId: string
  stopId: string
  reason: string
}

export type QueueMessage =
  | OrderCreatedMessage
  | AgentAssignedMessage
  | RouteActivatedMessage
  | StopDepartedMessage
  | OrderDeliveredMessage
  | OrderFailedMessage

// ── D1 row types ─────────────────────────────────────────────────────────────

export interface Hub {
  id: string
  tenant_id: string
  name: string
  address: string
  lat: number
  lng: number
  created_at: string
}

export interface Seller {
  id: string
  clerk_user_id: string
  tenant_id: string
  company_name: string
  gstin: string | null
  api_key_hash: string | null
  webhook_url: string | null
  webhook_secret: string | null
  webhook_events: string // JSON
  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  tenant_id: string
  seller_id: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  address: string
  lat: number
  lng: number
  hub_id: string | null
  status: OrderStatus
  parcel_weight: number
  parcel_size: ParcelSize
  delivery_window_start: string | null
  delivery_window_end: string | null
  otp_code_hash: string | null
  tracking_token: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type OrderStatus =
  | 'placed'
  | 'confirmed'
  | 'packed'
  | 'out_for_delivery'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'rescheduled'

export type ParcelSize = 'small' | 'medium' | 'large'

export interface DeliveryAgent {
  id: string
  tenant_id: string
  clerk_user_id: string
  name: string
  phone: string | null
  photo_url: string | null
  vehicle_type: VehicleType
  hub_id: string | null
  current_lat: number | null
  current_lng: number | null
  last_seen_at: string | null
  status: AgentStatus
  commission_pct: number
  created_at: string
  updated_at: string
}

export type AgentStatus = 'available' | 'on_route' | 'offline'
export type VehicleType = 'bike' | 'scooter' | 'van' | 'cycle'

export interface Route {
  id: string
  tenant_id: string
  agent_id: string | null
  hub_id: string
  date: string
  status: RouteStatus
  optimized_sequence: string // JSON: string[]
  total_distance_km: number
  estimated_duration_mins: number
  created_at: string
  updated_at: string
}

export type RouteStatus = 'planned' | 'active' | 'completed'

export interface RouteStop {
  id: string
  route_id: string
  order_id: string
  sequence_no: number
  status: StopStatus
  eta: string | null
  actual_arrival_at: string | null
  actual_departure_at: string | null
  failure_reason: string | null
  distance_from_prev_km: number
  created_at: string
  updated_at: string
}

export type StopStatus = 'pending' | 'heading_to' | 'arrived' | 'delivered' | 'failed'

export interface DeliveryEvent {
  id: string
  order_id: string
  agent_id: string | null
  event_type: string
  lat: number | null
  lng: number | null
  metadata: string // JSON
  created_at: string
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'dispatcher' | 'agent' | 'customer' | 'seller'

export interface AuthContext {
  userId: string
  orgId: string
  role: UserRole
  hubId?: string
}

// ── Hono variable types ──────────────────────────────────────────────────────

export type HonoVariables = {
  auth: AuthContext
  sellerId?: string
  tenantId?: string
}
