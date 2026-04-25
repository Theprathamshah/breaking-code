// ── D5 — Fare & Feedback types ────────────────────────────────────────────────

export interface FareConfig {
  baseFare: number
  perKmRate: number
  weightTier1Max: number
  weightTier1Surcharge: number
  weightTier2Max: number
  weightTier2Surcharge: number
  weightTier3Surcharge: number
  zonePremiumPct: number
  narrowWindowPremium: number
  bulkThreshold: number
  bulkDiscountPct: number
}

export interface FareConfigRow {
  id: string
  tenant_id: string
  base_fare: number
  per_km_rate: number
  weight_tier_1_max: number
  weight_tier_1_surcharge: number
  weight_tier_2_max: number
  weight_tier_2_surcharge: number
  weight_tier_3_surcharge: number
  zone_premium_pct: number
  narrow_window_premium: number
  bulk_threshold: number
  bulk_discount_pct: number
  created_at: string
  updated_at: string
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

export interface FareRow {
  id: string
  order_id: string
  quoted_fare: number
  settled_fare: number | null
  distance_km: number | null
  breakdown: string // JSON
  status: 'quoted' | 'settled' | 'waived'
  settled_at: string | null
  created_at: string
}

export interface EarningRow {
  id: string
  agent_id: string
  order_id: string
  gross_fare: number
  commission_pct: number
  partner_payout: number
  platform_cut: number
  status: 'pending' | 'approved' | 'paid'
  paid_at: string | null
  created_at: string
}

export interface FeedbackRow {
  id: string
  order_id: string
  agent_id: string | null
  from_actor: 'customer' | 'seller' | 'admin'
  rating: number
  comment: string | null
  created_at: string
}

export interface SubmitFeedbackBody {
  fromActor: 'customer' | 'seller' | 'admin'
  rating: number
  comment?: string
}
