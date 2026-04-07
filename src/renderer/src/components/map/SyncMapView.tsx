import { LatLngBounds } from 'leaflet'
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import type { MapState } from '../../hooks/useGeoData'

interface SyncMapViewProps {
  geoData: MapState
  followPosition?: boolean
  livePosition?: { lat: number; lon: number } | null
  isSessionActive?: boolean
  onFollowPositionChange?: (value: boolean) => void
}

export default function SyncMapView({
  geoData,
  followPosition = false,
  livePosition = null,
  isSessionActive = false,
  onFollowPositionChange
}: SyncMapViewProps): null {
  const map = useMap()
  const wasSessionActive = useRef(isSessionActive)

  useEffect(() => {
    // Detectar cuando sesión termina (de true a false)
    if (wasSessionActive.current === true && isSessionActive === false) {
      // Sesión acaba de terminar
      // Desmarcar checkbox
      onFollowPositionChange?.(false)
      
      // Centrar en bounds
      if (geoData.bounds) {
        const bounds = new LatLngBounds([
          [geoData.bounds.south, geoData.bounds.west],
          [geoData.bounds.north, geoData.bounds.east]
        ])
        map.fitBounds(bounds, { padding: [32, 32] })
      }
    }
    wasSessionActive.current = isSessionActive
  }, [isSessionActive, geoData.bounds, map, onFollowPositionChange])

  useEffect(() => {
    // Regla simple: si checkbox está marcado, centra en GPS actual
    if (!followPosition) {
      return
    }

    if (livePosition && livePosition.lat !== 0) {
      map.setView([livePosition.lat, livePosition.lon], 17)
    }
  }, [followPosition, livePosition, map])

  useEffect(() => {
    map.invalidateSize()
  }, [map])

  return null
}
