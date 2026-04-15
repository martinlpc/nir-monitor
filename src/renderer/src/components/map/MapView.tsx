import 'leaflet/dist/leaflet.css'
import { type LatLngExpression } from 'leaflet'
import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet'
import type { MapState } from '../../hooks/useGeoData'
import SyncMapView from './SyncMapView'

const DEFAULT_CENTER: LatLngExpression = [-34.6037, -58.3816]
const DEFAULT_ZOOM = 13

interface MapViewProps {
  geoData: MapState
  isSessionActive?: boolean
  followPosition?: boolean
  onFollowPositionChange?: (value: boolean) => void
}

export default function MapView({ geoData, isSessionActive = false, followPosition = true, onFollowPositionChange }: MapViewProps): React.JSX.Element {
  const [livePosition, setLivePosition] = useState<{ lat: number; lon: number; alt: number } | null>(null)
  const [lastKnownPosition, setLastKnownPosition] = useState<{ lat: number; lon: number; alt: number } | null>(null)

  // Escuchar posición GPS en tiempo real
  useEffect(() => {
    const clearLive = () => {
      setLivePosition((prev) => {
        if (prev !== null) setLastKnownPosition(prev)
        return null
      })
    }

    const unsubPosition = window.api.gps.onPosition((data) => {
      if (data.valid) {
        setLivePosition({ lat: data.coords.lat, lon: data.coords.lon, alt: data.coords.alt || 0 })
        setLastKnownPosition(null)
      } else {
        clearLive()
      }
    })

    const unsubFixLost = window.api.gps.onFixLost(clearLive)

    const unsubStatus = window.api.devices.onStatus((data) => {
      if (data.deviceId === 'gps' && data.status !== 'connected') {
        clearLive()
      }
    })

    return () => {
      unsubPosition()
      unsubFixLost()
      unsubStatus()
    }
  }, [])

  const lastPoint = geoData.allPoints.at(-1) ?? null
  const trackPoints = geoData.trackPoints

  const path = useMemo<LatLngExpression[]>(
    () => trackPoints.map((p) => [p.lat, p.lon]),
    [trackPoints]
  )

  return (
    <section className="map-view">
      <div className="map-view__header">
        <div>
          <h2>Mapa de recorrido</h2>
          <p className="map-view__caption">
            {followPosition
              ? livePosition
                ? 'Centrado en la posición GPS actual.'
                : 'Esperando GPS fix...'
              : geoData.allPoints.length === 0
                ? 'Habilita "Seguir mi posición" o espera muestras georreferenciadas.'
                : `${geoData.trackPoints.length} muestras registradas`}
          </p>
        </div>
        <div className="map-view__meta">
        </div>
      </div>

      <div className="map-view__canvas">
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom className="map-leaflet">
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <SyncMapView 
            geoData={geoData} 
            followPosition={followPosition}
            livePosition={livePosition}
            isSessionActive={isSessionActive}
            onFollowPositionChange={onFollowPositionChange}
          />
          {path.length > 1 ? <Polyline positions={path} color="#f0a646" weight={4} /> : null}
          {livePosition ? (
            <CircleMarker
              center={[livePosition.lat, livePosition.lon]}
              radius={10}
              pathOptions={{
                color: '#72baff',
                fillColor: '#d9f0ff',
                fillOpacity: 0.95,
                weight: 3
              }}
            >
              <Popup>
                Posición GPS actual
                <br />
                {livePosition.lat.toFixed(6)}, {livePosition.lon.toFixed(6)}
                <br />
                alt {livePosition.alt.toFixed(1)} m
              </Popup>
            </CircleMarker>
          ) : null}
          {lastKnownPosition && !livePosition ? (
            <CircleMarker
              center={[lastKnownPosition.lat, lastKnownPosition.lon]}
              radius={9}
              pathOptions={{
                color: '#888888',
                fillColor: '#cccccc',
                fillOpacity: 0.55,
                weight: 2,
                dashArray: '5 4'
              }}
            >
              <Popup>
                Última posición conocida
                <br />
                {lastKnownPosition.lat.toFixed(6)}, {lastKnownPosition.lon.toFixed(6)}
                <br />
                alt {lastKnownPosition.alt.toFixed(1)} m
              </Popup>
            </CircleMarker>
          ) : null}
          {lastPoint ? (
            <CircleMarker
              center={[lastPoint.position.lat, lastPoint.position.lon]}
              radius={8}
              pathOptions={{
                color: '#f36f45',
                fillColor: '#ffd494',
                fillOpacity: 0.9,
                weight: 3
              }}
            >
              <Popup>
                {lastPoint.emf.rss.toFixed(2)} {lastPoint.emf.unit}
                <br />
                {lastPoint.position.lat.toFixed(6)}, {lastPoint.position.lon.toFixed(6)}
                <br />
                Posicion GPS real
              </Popup>
            </CircleMarker>
          ) : null}
        </MapContainer>
      </div>
    </section>
  )
}
