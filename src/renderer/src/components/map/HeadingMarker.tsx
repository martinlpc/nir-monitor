import { memo, useMemo } from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import type { GpsPosition } from '../../hooks/GpsPositionProvider'

interface HeadingMarkerProps {
  position: GpsPosition
  heading?: number
}

function HeadingMarker({ position, heading }: HeadingMarkerProps) {
  const icon = useMemo(() => {
    const hasHeading = heading != null && heading >= 0

    return L.divIcon({
      className: 'gps-heading',
      html: `<div class="gps-heading__body">
        ${
          hasHeading
            ? `<div class="gps-heading__arrow" style="transform: rotate(${heading}deg)">
                <svg width="14" height="18" viewBox="0 0 14 18">
                  <polygon points="7,0 0,18 7,12 14,18" fill="#4a9eff"/>
                </svg>
              </div>`
            : ''
        }
        <div class="gps-heading__dot"></div>
      </div>`,
      iconSize: [28, 34],
      iconAnchor: [14, 17]
    })
  }, [heading])

  return (
    <Marker position={[position.lat, position.lon]} icon={icon}>
      <Popup>
        Posición GPS actual
        <br />
        {position.lat.toFixed(6)}, {position.lon.toFixed(6)}
        <br />
        alt {position.alt.toFixed(1)} m
        {heading != null && (
          <>
            <br />
            Rumbo: {heading.toFixed(0)}&deg;
          </>
        )}
      </Popup>
    </Marker>
  )
}

export default memo(HeadingMarker)
