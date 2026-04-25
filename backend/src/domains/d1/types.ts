export interface SellerRow {
  id: string
  clerk_user_id: string
  tenant_id: string
  company_name: string
  gstin: string | null
  api_key_hash: string | null
  webhook_url: string | null
  webhook_secret: string | null
  webhook_events: string
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

export interface OrderRow {
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

export type BatchStatus =
  | 'pending'
  | 'validated'
  | 'confirmed'
  | 'processing'
  | 'done'
  | 'failed'

export interface OrderBatchRow {
  id: string
  seller_id: string
  total_rows: number
  accepted_rows: number
  rejected_rows: number
  total_quoted_fare: number
  status: BatchStatus
  r2_key: string | null
  validation_report: string
  created_at: string
  updated_at: string
}

export interface FareConfig {
  id: string
  tenant_id: string
  base_fare: number
  per_km_rate: number
  weight_tier_1_max: number
  weight_tier_1_surcharge: number
  weight_tier_2_max: number
  weight_tier_2_surcharge: number
  weight_tier_3_surcharge: number
  zone_type: 'urban' | 'semi_urban'
  zone_premium_pct: number
  narrow_window_premium: number
  bulk_threshold: number
  bulk_discount_pct: number
  created_at?: string
  updated_at?: string
}

export interface FareBreakdown {
  base: number
  distance: number
  weightSurcharge: number
  zonePremium: number
  narrowWindowFee: number
  bulkDiscount: number
  total: number
}

export interface OrderFareRow {
  id: string
  order_id: string
  quoted_fare: number
  settled_fare: number | null
  distance_km: number | null
  breakdown: string
  status: 'quoted' | 'settled' | 'waived'
  settled_at: string | null
  created_at: string
}

export interface CsvValidationError {
  row: number
  field: string
  reason: string
}
