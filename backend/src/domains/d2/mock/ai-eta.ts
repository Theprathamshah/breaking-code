// ── Mock ETA computation ──────────────────────────────────────────────────────
// Drop-in replacement for computeETAs() that uses a fixed 30 km/h average
// without calling Workers AI. Used in dev / demo mode.

import type { OptimizedRoute } from '../optimizer'

const AVG_SPEED_KMH = 30
const STOP_MINS = 5

/**
 * Returns deterministic per-stop ETAs at 30 km/h average road speed.
 * Identical interface to computeETAs() in optimizer.ts.
 */
export function mockComputeETAs(
  startTime: Date,
  route: OptimizedRoute,
): Map<string, Date> {
  const etas = new Map<string, Date>()
  let cursor = startTime.getTime()

  for (let i = 0; i < route.sequence.length; i++) {
    const distKm = route.segmentDistances[i]
    const travelMs = ((distKm / AVG_SPEED_KMH) * 60 + STOP_MINS) * 60_000
    cursor += travelMs
    etas.set(route.sequence[i], new Date(cursor))
  }

  return etas
}
