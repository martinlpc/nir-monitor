import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'

interface PreloadBoundsOverlayProps {
  bounds: { north: number; south: number; east: number; west: number } | null
}

export default function PreloadBoundsOverlay({ bounds }: PreloadBoundsOverlayProps): null {
  const map = useMap()
  const rectRef = useRef<L.Rectangle | null>(null)

  useEffect(() => {
    if (rectRef.current) {
      rectRef.current.remove()
      rectRef.current = null
    }
    if (bounds) {
      rectRef.current = L.rectangle(
        [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east]
        ],
        {
          color: '#3388ff',
          weight: 2,
          fillColor: '#3388ff',
          fillOpacity: 0.1,
          dashArray: '8 6'
        }
      ).addTo(map)
    }
    return () => {
      rectRef.current?.remove()
    }
  }, [bounds, map])

  return null
}
