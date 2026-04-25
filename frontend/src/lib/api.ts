import { API_BASE } from '../env'

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })

  if (!res.ok) {
    const body = await res.json<{ error?: string }>().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`)
  }

  return res.json<T>()
}

// ── Agents ────────────────────────────────────────────────────────────────────

export interface Agent {
  id: string
  name: string
  phone: string | null
  photo_url: string | null
  vehicle_type: string
  hub_id: string | null
  status: 'available' | 'on_route' | 'offline'
  current_lat: number | null
  current_lng: number | null
  last_seen_at: string | null
  commission_pct: number
}

export const agentsApi = {
  list: (token: string, params?: { hubId?: string; status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString()
    return request<{ agents: Agent[] }>(`/api/agents${q ? `?${q}` : ''}`, { token })
  },
  updateStatus: (
    token: string,
    agentId: string,
    status: 'available' | 'on_route' | 'offline',
  ) =>
    request<{ success: boolean; status: string }>(`/api/agents/${agentId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
      token,
    }),
}

// ── Routes ────────────────────────────────────────────────────────────────────

export interface RouteStop {
  id: string
  sequence_no: number
  status: 'pending' | 'heading_to' | 'arrived' | 'delivered' | 'failed'
  eta: string | null
  distance_from_prev_km: number
  order_id: string
  customer_name: string
  customer_phone: string | null
  address: string
  lat: number
  lng: number
  parcel_weight: number
  parcel_size: string
  delivery_window_start: string | null
  delivery_window_end: string | null
  order_status: string
  failure_reason: string | null
}

export interface Route {
  id: string
  agent_id: string | null
  hub_id: string
  date: string
  status: 'planned' | 'active' | 'completed'
  total_distance_km: number
  estimated_duration_mins: number
  optimized_sequence: string[]
  stops?: RouteStop[]
}

export interface OptimizeResult {
  routeId: string
  hubId: string
  hubName: string
  date: string
  agentId: string | null
  status: string
  totalDistanceKm: number
  estimatedDurationMins: number
  stopCount: number
  stops: {
    stopId: string
    sequenceNo: number
    orderId: string
    customerName: string
    address: string
    lat: number
    lng: number
    eta: string | null
    distanceFromPrevKm: number
  }[]
}

export const routesApi = {
  list: (token: string, params?: { hubId?: string; date?: string; status?: string }) => {
    const q = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params ?? {}).filter(([, v]) => v !== undefined),
      ),
    ).toString()
    return request<{ routes: Route[] }>(`/api/routes${q ? `?${q}` : ''}`, { token })
  },
  get: (token: string, routeId: string) =>
    request<Route & { stops: RouteStop[] }>(`/api/routes/${routeId}`, { token }),
  optimize: (
    token: string,
    payload: { hubId: string; date: string; agentId?: string },
  ) =>
    request<OptimizeResult>('/api/routes/optimize', {
      method: 'POST',
      body: JSON.stringify(payload),
      token,
    }),
  activate: (token: string, routeId: string, agentId: string) =>
    request<{ success: boolean; stopCount: number }>(`/api/routes/${routeId}/activate`, {
      method: 'PATCH',
      body: JSON.stringify({ agentId }),
      token,
    }),
}

// ── Orders ────────────────────────────────────────────────────────────────────

export interface Order {
  id: string
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  address: string
  status: string
  parcel_weight: number
  parcel_size: string
  delivery_window_start: string | null
  delivery_window_end: string | null
  tracking_token: string | null
  created_at: string
  hub_id: string | null
  seller_id: string
}

export const ordersApi = {
  list: (token: string, params?: { status?: string; hubId?: string; limit?: number }) => {
    const q = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params ?? {})
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      ),
    ).toString()
    return request<{ orders: Order[] }>(`/api/orders${q ? `?${q}` : ''}`, { token })
  },
  create: (token: string, order: Partial<Order>) =>
    request<{ id: string; quotedFare: number }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(order),
      token,
    }),
}

// ── Tracking (public) ─────────────────────────────────────────────────────────

export interface TrackingInfo {
  mode: 'milestone' | 'live'
  order: {
    id: string
    status: string
    customerName: string
    address: string
    trackingToken: string
  }
  statusTimeline?: { status: string; ts: string }[]
  agentId?: string
  agentName?: string
  agentPhoto?: string | null
  eta?: string
}

export const trackingApi = {
  get: (token: string) => request<TrackingInfo>(`/track/${token}`),
}
