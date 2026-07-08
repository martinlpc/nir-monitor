import { memo, useMemo } from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import type { GpsPosition } from '../../hooks/GpsPositionProvider'

const SPEED_THRESHOLD_KMH = 1

interface HeadingMarkerProps {
  position: GpsPosition
  heading?: number
  speed?: number
}

function HeadingMarker({ position, heading, speed }: HeadingMarkerProps) {
  const icon = useMemo(() => {
    const showArrow = heading != null && heading >= 0 && speed != null && speed > SPEED_THRESHOLD_KMH

    const svg = showArrow
      ? `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
           <g style="transform-origin:20px 20px;transform:rotate(${heading}deg);transition:transform .3s ease">
             <polygon points="20,5 10,30 20,23 30,30" fill="#ff3b30"/>
           </g>
         </svg>`
      : `<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
           <circle cx="13" cy="13" r="10" fill="#72baff" stroke="#4a9eff" stroke-width="3"/>
         </svg>`

    return L.divIcon({
      className: 'gps-heading',
      html: svg,
      iconSize: showArrow ? [40, 40] : [26, 26],
      iconAnchor: showArrow ? [20, 20] : [13, 13]
    })
  }, [heading, speed])

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
        {speed != null && (
          <>
            <br />
            Vel: {speed.toFixed(1)} km/h
          </>
        )}
      </Popup>
    </Marker>
  )
}

export default memo(HeadingMarker)
