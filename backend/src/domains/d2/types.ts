// ── D2 domain-local row types ─────────────────────────────────────────────────
// These mirror the global types in src/types.ts but are scoped to D2's owned
// tables. Import from here inside d2/ files to avoid circular deps.

export type AgentStatus = 'available' | 'on_route' | 'offline'
export type VehicleType = 'bike' | 'scooter' | 'van' | 'cycle'
export type RouteStatus = 'planned' | 'active' | 'completed'
export type StopStatus = 'pending' | 'heading_to' | 'arrived' | 'delivered' | 'failed'

export interface HubRow {
  id: string
  tenant_id: string
  name: string
  address: string
  lat: number
  lng: number
  created_at: string
}

export interface AgentRow {
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

export interface RouteRow {
  id: string
  tenant_id: string
  agent_id: string | null
  hub_id: string
  date: string                   // YYYY-MM-DD
  status: RouteStatus
  optimized_sequence: string     // JSON: stop_id[] in delivery order
  total_distance_km: number
  estimated_duration_mins: number
  created_at: string
  updated_at: string
}

export interface RouteStopRow {
  id: string
  route_id: string
  order_id: string
  sequence_no: number
  status: StopStatus
  eta: string | null             // ISO 8601
  actual_arrival_at: string | null
  actual_departure_at: string | null
  failure_reason: string | null
  distance_from_prev_km: number
  created_at: string
  updated_at: string
}
