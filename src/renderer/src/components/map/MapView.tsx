import 'leaflet/dist/leaflet.css'
import { LatLngBounds, type LatLngExpression } from 'leaflet'
import { useEffect, useMemo, useState, useRef } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import type { MapState } from '../../hooks/useGeoData'

const DEFAULT_CENTER: LatLngExpression = [-34.6037, -58.3816]
const DEFAULT_ZOOM = 13

function SyncMapView({
  geoData,
  followPosition = false,
  currentGpsPosition = null,
  isSessionActive = false,
  onFollowPositionChange
}: {
  geoData: MapState
  followPosition?: boolean
  currentGpsPosition?: { lat: number; lon: number; valid: boolean } | null
  isSessionActive?: boolean
  onFollowPositionChange?: (value: boolean) => void
}): null {
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

    if (currentGpsPosition?.valid && currentGpsPosition.lat !== 0) {
      map.setView([currentGpsPosition.lat, currentGpsPosition.lon], 17)
    }
  }, [followPosition, currentGpsPosition, map])

  useEffect(() => {
    map.invalidateSize()
  }, [map])

  return null
}

interface MapViewProps {
  geoData: MapState
  isSessionActive?: boolean
}

export default function MapView({ geoData, isSessionActive = false }: MapViewProps): React.JSX.Element {
  const [currentGpsPosition, setCurrentGpsPosition] = useState<{
    lat: number
    lon: number
    alt: number
    valid: boolean
  } | null>(null)

  const [followPosition, setFollowPosition] = useState(true)

  // Escuchar posición GPS en tiempo real
  useEffect(() => {
    const unsubscribe = window.api.gps.onPosition((data) => {
      setCurrentGpsPosition({
        lat: data.coords.lat,
        lon: data.coords.lon,
        alt: data.coords.alt || 0,
        valid: data.valid
      })
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const gpsFix = currentGpsPosition?.valid ?? false
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
            {gpsFix
              ? 'Centrado en la posicion GPS actual.'
              : geoData.allPoints.length === 0
                ? 'Esperando posicion GPS o muestras georreferenciadas.'
                : `${geoData.trackPoints.length} muestras registradas`}
          </p>
        </div>
        <div className="map-view__meta">
          <label className="map-view__follow-checkbox">
            <input
              type="checkbox"
              checked={followPosition}
              onChange={(e) => setFollowPosition(e.target.checked)}
            />
            <span>Seguir mi posición</span>
          </label>
          <span className={`badge ${gpsFix ? 'ok' : 'danger'}`}>{gpsFix ? 'GPS fix' : 'GPS sin fix'}</span>
          {lastPoint ? (
            <div className="map-view__stats">
              <span>{lastPoint.emf.rss.toFixed(2)} {lastPoint.emf.unit}</span>
              <span>{new Date(lastPoint.timestamp).toLocaleTimeString('es-AR', { hour12: false })}</span>
            </div>
          ) : null}
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
            currentGpsPosition={currentGpsPosition}
            isSessionActive={isSessionActive}
            onFollowPositionChange={setFollowPosition}
          />
          {path.length > 1 ? <Polyline positions={path} color="#f0a646" weight={4} /> : null}
          {currentGpsPosition?.valid && currentGpsPosition.lat !== 0 ? (
            <CircleMarker
              center={[currentGpsPosition.lat, currentGpsPosition.lon]}
              radius={10}
              pathOptions={{
                color: '#72baff',
                fillColor: '#d9f0ff',
                fillOpacity: 0.95,
                weight: 3
              }}
            >
              <Popup>
                Posicion GPS actual
                <br />
                {currentGpsPosition.lat.toFixed(6)}, {currentGpsPosition.lon.toFixed(6)}
                <br />
                alt {currentGpsPosition.alt.toFixed(1)} m
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
