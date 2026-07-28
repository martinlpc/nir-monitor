import type { GeoPosition } from './GeoTimestamp'

export function haversineMeters(a: GeoPosition, b: GeoPosition): number {
  const R = 6_371_000
  const toRad = (deg: number): number => (deg * Math.PI) / 180

  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)

  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)

  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon

  return 2 * R * Math.asin(Math.sqrt(h))
}
