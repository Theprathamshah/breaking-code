// ── Mock orders for dev / demo mode ──────────────────────────────────────────
// Used by POST /api/routes/optimize when D1 has no real orders for a hub.
// Swap out for real D1 data by removing the mock fallback in routes.ts.

export interface DemoOrder {
  id: string
  lat: number
  lng: number
  customer_name: string
  address: string
  parcel_weight: number
  parcel_size: 'small' | 'medium' | 'large'
  delivery_window_start: string | null
  delivery_window_end: string | null
}

// Keyed by hub_id; falls back to 'default' if hub not found.
const DEMO_ORDERS: Record<string, DemoOrder[]> = {
  default: [
    {
      id: 'demo_o01',
      lat: 19.085, lng: 72.883,
      customer_name: 'Alice Sharma',
      address: '10 MG Road, Andheri East',
      parcel_weight: 1.2, parcel_size: 'small',
      delivery_window_start: null, delivery_window_end: null,
    },
    {
      id: 'demo_o02',
      lat: 19.095, lng: 72.891,
      customer_name: 'Bob Patel',
      address: '5 Hill Street, Bandra',
      parcel_weight: 3.5, parcel_size: 'medium',
      delivery_window_start: null, delivery_window_end: null,
    },
    {
      id: 'demo_o03',
      lat: 19.080, lng: 72.860,
      customer_name: 'Carol Nair',
      address: '22 Linking Road, Khar',
      parcel_weight: 0.8, parcel_size: 'small',
      delivery_window_start: null, delivery_window_end: null,
    },
    {
      id: 'demo_o04',
      lat: 19.056, lng: 72.830,
      customer_name: 'David Rao',
      address: '3 Hill Road, Bandra West',
      parcel_weight: 5.0, parcel_size: 'large',
      delivery_window_start: null, delivery_window_end: null,
    },
    {
      id: 'demo_o05',
      lat: 19.017, lng: 72.818,
      customer_name: 'Eva Iyer',
      address: '5 Worli Sea Face, Worli',
      parcel_weight: 2.1, parcel_size: 'medium',
      delivery_window_start: null, delivery_window_end: null,
    },
  ],
}

export function mockOrdersForHub(hubId: string): DemoOrder[] {
  return DEMO_ORDERS[hubId] ?? DEMO_ORDERS['default']
}
