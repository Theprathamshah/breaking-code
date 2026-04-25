function hashAddress(address: string): number {
  let hash = 2166136261

  for (const char of address) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }

  return Math.abs(hash >>> 0)
}

export function mockGeocode(address: string): { lat: number; lng: number } {
  const hash = hashAddress(address.trim().toLowerCase())
  const latOffset = ((hash % 1200) - 600) / 10000
  const lngOffset = (((Math.floor(hash / 1200)) % 1200) - 600) / 10000

  return {
    lat: Math.round((19.076 + latOffset) * 1_000_000) / 1_000_000,
    lng: Math.round((72.8777 + lngOffset) * 1_000_000) / 1_000_000,
  }
}
