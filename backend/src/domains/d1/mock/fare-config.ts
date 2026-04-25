import type { FareConfig } from '../types'

export const DEMO_FARE_CONFIG: FareConfig = {
  id: 'fare_demo01',
  tenant_id: 'tenant_demo',
  base_fare: 20,
  per_km_rate: 5,
  weight_tier_1_max: 1,
  weight_tier_1_surcharge: 0,
  weight_tier_2_max: 5,
  weight_tier_2_surcharge: 10,
  weight_tier_3_surcharge: 25,
  zone_type: 'urban',
  zone_premium_pct: 0,
  narrow_window_premium: 15,
  bulk_threshold: 50,
  bulk_discount_pct: 5,
}
