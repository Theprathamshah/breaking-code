// ── D4 — Delivery Execution types ────────────────────────────────────────────

export type PhotoStage = 'pre_delivery' | 'open_box' | 'pod'

export interface ArriveBody {
  // No body fields — action is fully determined by stop context
}

export interface OtpRequestBody {
  // No body fields — OTP generated server-side
}

export interface OtpVerifyBody {
  otp: string
}

export interface FailStopBody {
  reason: string
}

// Frames sent by agent over WebSocket
export interface AgentGPSFrame {
  lat: number
  lng: number
  speed?: number
  heading?: number
}

// Frames received by customer over WebSocket
export type CustomerWSFrame =
  | { event: 'gps'; lat: number; lng: number; ts: number }
  | { event: 'delivered' }
  | { event: 'failed' }

// Row shape for stop + order join
export interface StopRow {
  stop_id: string
  route_id: string
  order_id: string
  agent_id: string | null
  status: string
  otp_code_hash: string | null
  customer_phone: string | null
  customer_name: string
  tracking_token: string | null
  distance_from_prev_km: number
}
