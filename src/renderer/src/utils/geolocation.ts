import type { GeoPosition } from '../../../shared/GeoTimestamp'

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

export interface LocationInfo {
  name: string
  city?: string
  country?: string
}

interface NominatimAddress {
  suburb?: string
  city?: string
  town?: string
  village?: string
  county?: string
  country?: string
}

interface NominatimResponse {
  address?: NominatimAddress
}

/**
 * Obtiene información de ubicación (nombre de lugar) desde coordenadas usando Nominatim
 * Esta es una llamada a OpenStreetMap API, debería ser usada con moderación
 */
export async function reverseGeocode(position: GeoPosition): Promise<LocationInfo | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.lat}&lon=${position.lon}&zoom=16&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'es'
        },
        signal: AbortSignal.timeout(5000)
      }
    )

    if (!response.ok) {
      console.warn('[reverseGeocode] API returned status:', response.status)
      return null
    }

    const data: NominatimResponse = await response.json()
    const address = data.address ?? {}

    // Prioridad: barrio -> ciudad -> pueblo -> región
    const name =
      address.suburb ||
      address.city ||
      address.town ||
      address.village ||
      address.county ||
      'Ubicación desconocida'

    return {
      name,
      city: address.city || address.town || undefined,
      country: address.country || undefined
    }
  } catch (err) {
    console.error('[reverseGeocode] Error:', err)
    return null
  }
}

/**
 * Genera nombre de sesión con ubicación
 * Ej: "Sesión en San Isidro" o "Sesión en Zona Norte"
 */
export async function generateSessionName(position?: GeoPosition): Promise<string> {
  if (!position) {
    const now = new Date()
    return `Sesión ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
  }

  const location = await reverseGeocode(position)
  if (location?.name) {
    return `Sesión en ${location.name}`
  }

  const now = new Date()
  return `Sesión ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
}
