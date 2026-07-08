import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef } from 'react'
import L, { type LatLngExpression } from 'leaflet'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import type { MapState } from '../../hooks/useGeoData'
import type { LoadedSession } from '../../hooks/useMultipleSessions'
import type { GeoTimestamp } from '../../../../shared/GeoTimestamp'
import { useGpsPosition } from '../../hooks/useGpsPosition'
import { getIntensityColor } from '../../utils/intensityPalette'
import type { TileProvider } from '../../../../shared/tileProviders'
import { getProvider } from '../../../../shared/tileProviders'
import SyncMapView from './SyncMapView'
import PanControl from './PanControl'
import HeadingMarker from './HeadingMarker'
import MaximizeControl from './MaximizeControl'
import NbmStatusBadge from './NbmStatusBadge'
import PreloadBoundsOverlay from './PreloadBoundsOverlay'

function getPointPopupContent(point: GeoTimestamp): string {
  const unit = point.emf?.unit ?? 'V/m'
  const parts: string[] = [
    `Valor medido: ${(point.correctedMeasurement ?? 0).toFixed(2)} ${unit}`,
    `Lat: ${(point.position?.lat ?? 0).toFixed(6)}`,
    `Lon: ${(point.position?.lon ?? 0).toFixed(6)}`,
    `Alt: ${(point.position?.alt ?? 0).toFixed(1)} m`,
    new Date(point.timestamp).toLocaleTimeString()
  ]
  return parts.join('<br/>')
}

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
  tileProvider?: TileProvider
  onMapReady?: (map: L.Map) => void
  preloadBounds?: { north: number; south: number; east: number; west: number } | null
  focusedPointId?: string | null
  onPointClick?: (point: GeoTimestamp) => void
}

function ZoomLevelIndicator(): null {
  const map = useMap()
  const elRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = L.DomUtil.create('div', 'map-zoom-indicator')
    elRef.current = el

    function update(): void {
      el.textContent = `Zoom ${map.getZoom()}`
    }
    update()

    map.on('zoomend', update)

    const control = new (L.Control.extend({
      onAdd() {
        return el
      },
      onRemove() {
        elRef.current = null
      }
    }))({ position: 'topright' })

    control.addTo(map)

    return () => {
      map.off('zoomend', update)
      control.remove()
    }
  }, [map])

  return null
}

function MapInstanceCapture({ onMap }: { onMap: (map: L.Map) => void }): null {
  const map = useMap()
  useEffect(() => {
    onMap(map)
  }, [map, onMap])
  return null
}

function FocusPointHandler({
  focusedPointId,
  allPoints
}: {
  focusedPointId?: string | null
  allPoints: GeoTimestamp[]
}): null {
  const map = useMap()

  useEffect(() => {
    if (focusedPointId == null) return
    const point = allPoints.find((p) => p.id === focusedPointId)
    if (!point?.position) return

    const { lat, lon } = point.position
    map.flyTo([lat, lon], map.getZoom())
    map.openPopup(getPointPopupContent(point), [lat, lon])
  }, [focusedPointId, allPoints, map])

  return null
}

export default function MapView({
  geoData,
  isSessionActive = false,
  followPosition = true,
  onFollowPositionChange,
  maximized = false,
  onToggleMaximize,
  loadedSessions = [],
  focusSessionBounds = null,
  tileProvider = getProvider('osm')!,
  onMapReady,
  preloadBounds = null,
  focusedPointId = null,
  onPointClick
}: MapViewProps): React.JSX.Element {
  const { position: livePosition, lastKnownPosition, heading } = useGpsPosition()

  const lastPoint = geoData.allPoints.at(-1) ?? null

  const GAP_COLOR = '#555555'

  const activeSegments = useMemo(() => {
    const pts = geoData.allPoints.filter((p) => p.position !== null && p.position !== undefined)
    const segments: { key: string; positions: LatLngExpression[]; color: string }[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const mid: LatLngExpression = [
        (pts[i].position.lat + pts[i + 1].position.lat) / 2,
        (pts[i].position.lon + pts[i + 1].position.lon) / 2
      ]
      const isGap = pts[i + 1].gpsGap === true
      segments.push(
        {
          key: `seg-${pts[i].id}-a`,
          positions: [[pts[i].position.lat, pts[i].position.lon], mid],
          color: isGap ? GAP_COLOR : getIntensityColor(pts[i].correctedMeasurement)
        },
        {
          key: `seg-${pts[i].id}-b`,
          positions: [mid, [pts[i + 1].position.lat, pts[i + 1].position.lon]],
          color: isGap ? GAP_COLOR : getIntensityColor(pts[i + 1].correctedMeasurement)
        }
      )
    }
    return segments
  }, [geoData.allPoints])

  const loadedSegments = useMemo(() => {
    return loadedSessions
      .filter((session) => session.visible && session.points.length > 0)
      .map((session) => {
        const pts = session.points.filter((p) => p.position !== null && p.position !== undefined)
        const segments: { key: string; positions: LatLngExpression[]; color: string }[] = []
        for (let i = 0; i < pts.length - 1; i++) {
          const mid: LatLngExpression = [
            (pts[i].position.lat + pts[i + 1].position.lat) / 2,
            (pts[i].position.lon + pts[i + 1].position.lon) / 2
          ]
          const isGap = pts[i + 1].gpsGap === true
          segments.push(
            {
              key: `${session.id}-seg-${i}-a`,
              positions: [[pts[i].position.lat, pts[i].position.lon], mid],
              color: isGap ? GAP_COLOR : getIntensityColor(pts[i].correctedMeasurement)
            },
            {
              key: `${session.id}-seg-${i}-b`,
              positions: [mid, [pts[i + 1].position.lat, pts[i + 1].position.lon]],
              color: isGap ? GAP_COLOR : getIntensityColor(pts[i + 1].correctedMeasurement)
            }
          )
        }
        return { sessionId: session.id, segments }
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
        <div className="map-view__meta"></div>
      </div>

      <div className="map-view__canvas">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom
          className="map-leaflet"
        >
          <TileLayer
            attribution={tileProvider.attribution}
            url={`tile-cache://${tileProvider.id}/{z}/{x}/{y}.png`}
          />
          <ZoomLevelIndicator />
          {onMapReady && <MapInstanceCapture onMap={onMapReady} />}
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
          <NbmStatusBadge />
          <PreloadBoundsOverlay bounds={preloadBounds} />
          <FocusPointHandler focusedPointId={focusedPointId} allPoints={geoData.allPoints} />
          {activeSegments.map((seg) => (
            <Polyline key={seg.key} positions={seg.positions} color={seg.color} weight={4} />
          ))}
          {loadedSegments.map((session) =>
            session.segments.map((seg) => (
              <Polyline
                key={seg.key}
                positions={seg.positions}
                color={seg.color}
                weight={3}
                opacity={0.85}
              />
            ))
          )}
          {geoData.allPoints.map((point) => {
            const pointColor = getIntensityColor(point.correctedMeasurement)
            return (
              <CircleMarker
                key={point.id}
                center={[point.position.lat, point.position.lon]}
                radius={6}
                pathOptions={{
                  color: pointColor,
                  fillColor: pointColor,
                  fillOpacity: 0.8,
                  weight: 2
                }}
                eventHandlers={{
                  click: () => onPointClick?.(point)
                }}
              >
                <Popup>
                  Valor medido: {(point.correctedMeasurement ?? 0).toFixed(2)}{' '}
                  {point.emf?.unit ?? 'V/m'}
                  <br />
                  Lat: {(point.position?.lat ?? 0).toFixed(6)}
                  <br />
                  Lon: {(point.position?.lon ?? 0).toFixed(6)}
                  <br />
                  Alt: {(point.position?.alt ?? 0).toFixed(1)} m
                  <br />
                  {new Date(point.timestamp).toLocaleTimeString()}
                </Popup>
              </CircleMarker>
            )
          })}
          {livePosition ? <HeadingMarker position={livePosition} heading={heading} /> : null}
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
          {lastPoint && isSessionActive ? (
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
                {(lastPoint.emf?.rawMeasurement ?? 0).toFixed(2)} {lastPoint.emf?.unit ?? 'V/m'}
                <br />
                {(lastPoint.position?.lat ?? 0).toFixed(6)},{' '}
                {(lastPoint.position?.lon ?? 0).toFixed(6)}
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
