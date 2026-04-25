import { haversine } from '../../d2/optimizer'
import type { Env, Hub } from '../../../types'
import { mockGeocode } from '../mock/geocoder'

export async function geocodeAddress(_env: Env, address: string): Promise<{ lat: number; lng: number }> {
  return mockGeocode(address)
}

export function computeDistanceKm(hub: Pick<Hub, 'lat' | 'lng'>, point: { lat: number; lng: number }): number {
  return Math.round(haversine(hub.lat, hub.lng, point.lat, point.lng) * 100) / 100
}
