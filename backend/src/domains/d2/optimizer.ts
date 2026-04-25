// ── Haversine distance ────────────────────────────────────────────────────────

/** Returns great-circle distance in kilometres between two lat/lng points. */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371 // Earth radius km
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface GeoStop {
  id: string
  lat: number
  lng: number
}

export interface OptimizedRoute {
  /** Stop IDs in delivery order */
  sequence: string[]
  /** Per-segment distances (index i = distance from stop[i-1] or hub to stop[i]) */
  segmentDistances: number[]
  totalDistanceKm: number
  estimatedDurationMins: number
}

// ── Nearest-neighbour TSP ────────────────────────────────────────────────────

/**
 * Greedy nearest-neighbour heuristic starting from the hub.
 * O(n²) — works fine for ≤ 200 stops per route.
 *
 * @param hubLat      Hub origin latitude
 * @param hubLng      Hub origin longitude
 * @param stops       Delivery stops to sequence
 * @param avgSpeedKmh Average road speed (default 25 km/h for urban)
 * @param stopMins    Time spent per stop in minutes (default 5)
 */
export function optimizeRoute(
  hubLat: number,
  hubLng: number,
  stops: GeoStop[],
  avgSpeedKmh = 25,
  stopMins = 5,
): OptimizedRoute {
  if (stops.length === 0) {
    return { sequence: [], segmentDistances: [], totalDistanceKm: 0, estimatedDurationMins: 0 }
  }

  const unvisited = new Set(stops.map((_, i) => i))
  const sequence: number[] = []
  const segmentDistances: number[] = []

  let curLat = hubLat
  let curLng = hubLng
  let totalDist = 0

  while (unvisited.size > 0) {
    let nearestIdx = -1
    let nearestDist = Infinity

    for (const idx of unvisited) {
      const d = haversine(curLat, curLng, stops[idx].lat, stops[idx].lng)
      if (d < nearestDist) {
        nearestDist = d
        nearestIdx = idx
      }
    }

    unvisited.delete(nearestIdx)
    sequence.push(nearestIdx)
    segmentDistances.push(round2(nearestDist))
    totalDist += nearestDist

    curLat = stops[nearestIdx].lat
    curLng = stops[nearestIdx].lng
  }

  const drivingMins = (totalDist / avgSpeedKmh) * 60
  const estimatedDurationMins = Math.ceil(drivingMins + stops.length * stopMins)

  return {
    sequence: sequence.map((i) => stops[i].id),
    segmentDistances,
    totalDistanceKm: round2(totalDist),
    estimatedDurationMins,
  }
}

// ── ETA computation ──────────────────────────────────────────────────────────

/**
 * Compute per-stop ETAs given a route start time.
 * Returns a Map<stopId, Date>.
 */
export function computeETAs(
  startTime: Date,
  route: OptimizedRoute,
  avgSpeedKmh = 25,
  stopMins = 5,
): Map<string, Date> {
  const etas = new Map<string, Date>()
  let cursor = startTime.getTime()

  for (let i = 0; i < route.sequence.length; i++) {
    const distKm = route.segmentDistances[i]
    const travelMs = ((distKm / avgSpeedKmh) * 60 + stopMins) * 60_000
    cursor += travelMs
    etas.set(route.sequence[i], new Date(cursor))
  }

  return etas
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number) {
  return Math.round(n * 100) / 100
}
