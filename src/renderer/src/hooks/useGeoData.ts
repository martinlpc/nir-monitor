import { useMemo, useCallback } from 'react'
import type { GeoTimestamp, GeoPosition } from '../../../shared/GeoTimestamp'

export interface MapBounds {
  north: number
  south: number
  east: number
  west: number
}

export interface MapState {
  center: GeoPosition | null
  bounds: MapBounds | null
  allPoints: GeoTimestamp[]
  trackPoints: GeoPosition[]
}

/**
 * Hook para gestión de datos geoespaciales del mapa
 * - Aggregación de puntos GPS + EMF
 * - Cálculo de bounds y center
 * - Estado del mapa en tiempo real
 */
export function useGeoData(geoPoints: GeoTimestamp[], pointCount?: number) {
  const mapState = useMemo<MapState>(() => {
    if (geoPoints.length === 0) {
      return { center: null, bounds: null, allPoints: [], trackPoints: [] }
    }

    const validPoints = geoPoints.filter((p) => p.position !== null && p.position !== undefined)
    if (validPoints.length === 0) {
      return { center: null, bounds: null, allPoints: geoPoints, trackPoints: [] }
    }

    const lats = validPoints.map((p) => p.position.lat)
    const lons = validPoints.map((p) => p.position.lon)

    const bounds: MapBounds = {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lons),
      west: Math.min(...lons)
    }

    const center: GeoPosition =
      validPoints.length === 1
        ? validPoints[0].position
        : {
            lat: (bounds.north + bounds.south) / 2,
            lon: (bounds.east + bounds.west) / 2,
            alt: validPoints[0].position.alt || 0,
            hdop: validPoints[validPoints.length - 1].position.hdop
          }

    const trackPoints: GeoPosition[] = validPoints.map((p) => p.position)

    return { center, bounds, allPoints: geoPoints, trackPoints }
    // pointCount forces recompute when points are added via mutable ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoPoints, pointCount])

  const getPointsInBounds = useCallback(
    (testBounds: MapBounds): GeoTimestamp[] => {
      return mapState.allPoints.filter((p) => {
        const { lat, lon } = p.position
        return (
          lat >= testBounds.south &&
          lat <= testBounds.north &&
          lon >= testBounds.west &&
          lon <= testBounds.east
        )
      })
    },
    [mapState.allPoints]
  )

  const calculateDistance = useCallback((p1: GeoPosition, p2: GeoPosition): number => {
    const R = 6371000
    const φ1 = (p1.lat * Math.PI) / 180
    const φ2 = (p2.lat * Math.PI) / 180
    const Δφ = ((p2.lat - p1.lat) * Math.PI) / 180
    const Δλ = ((p2.lon - p1.lon) * Math.PI) / 180

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }, [])

  const getTotalDistance = useCallback((): number => {
    let total = 0
    for (let i = 1; i < mapState.trackPoints.length; i++) {
      total += calculateDistance(mapState.trackPoints[i - 1], mapState.trackPoints[i])
    }
    return total
  }, [mapState.trackPoints, calculateDistance])

  return {
    // Estado
    center: mapState.center,
    bounds: mapState.bounds,
    allPoints: mapState.allPoints,
    trackPoints: mapState.trackPoints,

    // Métodos
    getPointsInBounds,
    calculateDistance,
    getTotalDistance,

    // Helpers
    hasData: mapState.trackPoints.length > 0,
    pointCount: mapState.allPoints.length,
    validPointCount: mapState.trackPoints.length
  }
}
