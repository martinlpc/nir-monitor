import 'leaflet/dist/leaflet.css'
import { type LatLngExpression } from 'leaflet'
import { useMemo } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet'
import type { MapState } from '../../hooks/useGeoData'
import type { LoadedSession } from '../../hooks/useMultipleSessions'
import { useGpsPosition } from '../../hooks/useGpsPosition'
import SyncMapView from './SyncMapView'
import PanControl from './PanControl'
import MaximizeControl from './MaximizeControl'

const DEFAULT_CENTER: LatLngExpression = [-34.6037, -58.3816]
const DEFAULT_ZOOM = 13

interface MapViewProps {
  geoData: MapState
  isSessionActive?: boolean
  followPosition?: boolean
  onFollowPositionChange?: (value: boolean) => void
  maximized?: boolean
  onToggleMaximize?: () => void
  loadedSessions?: LoadedSession[]
  focusSessionBounds?: { north: number; south: number; east: number; west: number } | null
}

export default function MapView({ geoData, isSessionActive = false, followPosition = true, onFollowPositionChange, maximized = false, onToggleMaximize, loadedSessions = [], focusSessionBounds = null }: MapViewProps): React.JSX.Element {
  const { position: livePosition, lastKnownPosition } = useGpsPosition()

  const lastPoint = geoData.allPoints.at(-1) ?? null
  const trackPoints = geoData.trackPoints

  const path = useMemo<LatLngExpression[]>(
    () => trackPoints.map((p) => [p.lat, p.lon]),
    [trackPoints]
  )

  // Renderizar polylines para sesiones cargadas
  const additionalPaths = useMemo(() => {
    return loadedSessions
      .filter((session) => session.visible && session.points.length > 0)
      .map((session) => {
        const sessionPath = session.points
          .filter((p) => p.position !== null && p.position !== undefined)
          .map((p) => [p.position.lat, p.position.lon] as LatLngExpression)
        return { sessionId: session.id, path: sessionPath, color: session.color, label: session.label }
      })
  }, [loadedSessions])

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
            maximized={maximized}
            focusSessionBounds={focusSessionBounds}
          />
          <PanControl />
          {onToggleMaximize && (
            <MaximizeControl maximized={maximized} onToggle={onToggleMaximize} />
          )}
          {path.length > 1 ? <Polyline positions={path} color="#f0a646" weight={4} /> : null}
          {additionalPaths.map((item) => (
            <Polyline
              key={item.sessionId}
              positions={item.path}
              color={item.color}
              weight={3}
              opacity={0.7}
              dashArray="5 5"
            />
          ))}
          {/* Renderizar todos los puntos de medición como marcadores */}
          {geoData.allPoints.map((point) => (
            <CircleMarker
              key={point.id}
              center={[point.position.lat, point.position.lon]}
              radius={6}
              pathOptions={{
                color: '#f0a646',
                fillColor: '#ffd494',
                fillOpacity: 0.8,
                weight: 2
              }}
            >
              <Popup>
                Medición: {point.emf.rss.toFixed(2)} {point.emf.unit}
                <br />
                Lat: {point.position.lat.toFixed(6)}
                <br />
                Lon: {point.position.lon.toFixed(6)}
                <br />
                Alt: {point.position.alt.toFixed(1)} m
                <br />
                {new Date(point.timestamp).toLocaleTimeString()}
              </Popup>
            </CircleMarker>
          ))}
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
