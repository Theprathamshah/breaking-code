import type { FareConfig, FareBreakdown, FareConfigRow } from './types'

// ── Config row ↔ domain object ────────────────────────────────────────────────

export function rowToConfig(row: FareConfigRow): FareConfig {
  return {
    baseFare: row.base_fare,
    perKmRate: row.per_km_rate,
    weightTier1Max: row.weight_tier_1_max,
    weightTier1Surcharge: row.weight_tier_1_surcharge,
    weightTier2Max: row.weight_tier_2_max,
    weightTier2Surcharge: row.weight_tier_2_surcharge,
    weightTier3Surcharge: row.weight_tier_3_surcharge,
    zonePremiumPct: row.zone_premium_pct,
    narrowWindowPremium: row.narrow_window_premium,
    bulkThreshold: row.bulk_threshold,
    bulkDiscountPct: row.bulk_discount_pct,
  }
}

// ── Fare calculation ──────────────────────────────────────────────────────────

export function computeFare(params: {
  config: FareConfig
  distanceKm: number
  weightKg: number
  deliveryWindowStart?: string | null
  deliveryWindowEnd?: string | null
  isBulk?: boolean
}): FareBreakdown {
  const { config, distanceKm, weightKg, deliveryWindowStart, deliveryWindowEnd, isBulk = false } =
    params

  const base = config.baseFare
  const distance = round2(distanceKm * config.perKmRate)

  // Weight surcharge by tier
  let weightSurcharge = 0
  if (weightKg <= config.weightTier1Max) {
    weightSurcharge = config.weightTier1Surcharge
  } else if (weightKg <= config.weightTier2Max) {
    weightSurcharge = config.weightTier2Surcharge
  } else {
    weightSurcharge = config.weightTier3Surcharge
  }

  // Zone premium (percentage of base + distance)
  const zonePremium = round2((base + distance) * (config.zonePremiumPct / 100))

  // Narrow window fee: applies when window duration < 3 hours
  let narrowWindowFee = 0
  if (deliveryWindowStart && deliveryWindowEnd) {
    const windowHours =
      (new Date(deliveryWindowEnd).getTime() - new Date(deliveryWindowStart).getTime()) / 3_600_000
    if (windowHours > 0 && windowHours < 3) {
      narrowWindowFee = config.narrowWindowPremium
    }
  }

  const subtotal = base + distance + weightSurcharge + zonePremium + narrowWindowFee
  const bulkDiscount = isBulk ? round2(subtotal * (config.bulkDiscountPct / 100)) : 0
  const total = round2(Math.max(0, subtotal - bulkDiscount))

  return { base, distance, weightSurcharge, zonePremium, narrowWindowFee, bulkDiscount, total }
}

// ── KV cache helpers ──────────────────────────────────────────────────────────

const FARE_CONFIG_KV_PREFIX = 'fare_config:'
const FARE_CONFIG_TTL_S = 3600

export async function getFareConfigCached(
  kv: KVNamespace,
  db: D1Database,
  tenantId: string,
): Promise<FareConfig | null> {
  // Try KV first
  const cached = await kv.get<FareConfig>(`${FARE_CONFIG_KV_PREFIX}${tenantId}`, 'json')
  if (cached) return cached

  // Fallback to DB
  const row = await db
    .prepare('SELECT * FROM fare_configs WHERE tenant_id = ? LIMIT 1')
    .bind(tenantId)
    .first<FareConfigRow>()

  if (!row) return null

  const config = rowToConfig(row)
  await kv.put(`${FARE_CONFIG_KV_PREFIX}${tenantId}`, JSON.stringify(config), {
    expirationTtl: FARE_CONFIG_TTL_S,
  })

  return config
}

export async function bustFareConfigCache(kv: KVNamespace, tenantId: string): Promise<void> {
  await kv.delete(`${FARE_CONFIG_KV_PREFIX}${tenantId}`)
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
