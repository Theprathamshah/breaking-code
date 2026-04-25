import type { Env } from '../../../types'
import type { FareBreakdown, FareConfig } from '../types'
import { DEMO_FARE_CONFIG } from '../mock/fare-config'

const FARE_KV_PREFIX = 'fare_config:'
const FARE_KV_TTL_SECONDS = 3600

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function quoteFare(
  config: FareConfig,
  distanceKm: number,
  weight: number,
  windowHours: number | null,
  bulkCount: number,
): FareBreakdown {
  const base = config.base_fare
  const distance = round2(distanceKm * config.per_km_rate)
  const weightSurcharge =
    weight <= config.weight_tier_1_max
      ? config.weight_tier_1_surcharge
      : weight <= config.weight_tier_2_max
        ? config.weight_tier_2_surcharge
        : config.weight_tier_3_surcharge
  const zonePremium = round2(base * (config.zone_premium_pct / 100))
  const narrowWindowFee =
    windowHours !== null && windowHours < 3 ? config.narrow_window_premium : 0
  const subtotal = base + distance + weightSurcharge + zonePremium + narrowWindowFee
  const bulkDiscount =
    bulkCount >= config.bulk_threshold
      ? round2(subtotal * (config.bulk_discount_pct / 100))
      : 0
  const total = round2(subtotal - bulkDiscount)

  return {
    base,
    distance,
    weightSurcharge,
    zonePremium,
    narrowWindowFee,
    bulkDiscount,
    total,
  }
}

export async function getFareConfig(env: Env, tenantId: string): Promise<FareConfig> {
  const cacheKey = `${FARE_KV_PREFIX}${tenantId}`
  const cached = await env.KV.get<FareConfig>(cacheKey, 'json')
  if (cached) return cached

  const config = await env.DB.prepare(
    'SELECT * FROM fare_configs WHERE tenant_id = ? LIMIT 1',
  )
    .bind(tenantId)
    .first<FareConfig>()

  const resolved = config ?? { ...DEMO_FARE_CONFIG, tenant_id: tenantId }
  await env.KV.put(cacheKey, JSON.stringify(resolved), { expirationTtl: FARE_KV_TTL_SECONDS })
  return resolved
}
