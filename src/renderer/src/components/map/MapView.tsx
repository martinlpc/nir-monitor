import 'leaflet/dist/leaflet.css'
import { LatLngBounds, type LatLngExpression } from 'leaflet'
import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'

type CurrentPosition = {
  lat: number
  lng: number
  alt: number
  valid: boolean
}

type TrackPoint = {
  lat: number
  lng: number
  value: number
  unit: string
  timestamp: number
  interpolated: boolean
}

const DEFAULT_CENTER: LatLngExpression = [-34.6037, -58.3816]
const DEFAULT_ZOOM = 13

function SyncMapView({
  currentPosition,
  points
}: {
  currentPosition: CurrentPosition | null
  points: TrackPoint[]
}): null {
  const map = useMap()

  useEffect(() => {
    if (currentPosition?.valid) {
      map.setView([currentPosition.lat, currentPosition.lng], 17)
      return
    }

    if (points.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
      return
    }

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 16)
      return
    }

    const bounds = new LatLngBounds(
      points.map((point) => [point.lat, point.lng] as [number, number])
    )
    map.fitBounds(bounds, { padding: [32, 32] })
  }, [currentPosition, map, points])

  useEffect(() => {
    map.invalidateSize()
  }, [map])

  return null
}

export default function MapView(): React.JSX.Element {
  const [currentPosition, setCurrentPosition] = useState<CurrentPosition | null>(null)
  const [points, setPoints] = useState<TrackPoint[]>([])
  const gpsFix = currentPosition?.valid ?? false

  useEffect(() => {
    const offGps = window.api.gps.onPosition((data) => {
      setCurrentPosition({
        lat: data.coords?.lat ?? 0,
        lng: data.coords?.lon ?? 0,
        alt: data.coords?.alt ?? 0,
        valid: data.valid
      })
    })

    const offSample = window.api.session.onSample((point) => {
      setPoints((prev) => [
        ...prev,
        {
          lat: point.position.lat,
          lng: point.position.lon,
          value: point.emf.rss,
          unit: point.emf.unit,
          timestamp: point.timestamp,
          interpolated: point.interpolated
        }
      ])
    })

    return () => {
      offGps()
      offSample()
    }
  }, [])

  const path = useMemo<LatLngExpression[]>(
    () => points.map((point) => [point.lat, point.lng] as LatLngExpression),
    [points]
  )

  const lastPoint = points.at(-1) ?? null

  return (
    <section className="map-view">
      <div className="map-view__header">
        <div>
          <h2>Mapa de recorrido</h2>
          <p className="map-view__caption">
            {gpsFix
              ? 'Centrado en la posicion GPS actual.'
              : points.length === 0
                ? 'Esperando posicion GPS o muestras georreferenciadas.'
                : `${points.length} muestras registradas`}
          </p>
        </div>
        <div className="map-view__meta">
          <span className={`badge ${gpsFix ? 'ok' : 'danger'}`}>{gpsFix ? 'GPS fix' : 'GPS sin fix'}</span>
          {lastPoint ? (
            <div className="map-view__stats">
              <span>{lastPoint.value.toFixed(2)} {lastPoint.unit}</span>
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
          <SyncMapView currentPosition={currentPosition} points={points} />
          {path.length > 1 ? <Polyline positions={path} color="#f0a646" weight={4} /> : null}
          {currentPosition?.valid && currentPosition.lat !== 0 ? (
            <CircleMarker
              center={[currentPosition.lat, currentPosition.lng]}
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
                {currentPosition.lat.toFixed(6)}, {currentPosition.lng.toFixed(6)}
                <br />
                alt {currentPosition.alt.toFixed(1)} m
              </Popup>
            </CircleMarker>
          ) : null}
          {lastPoint ? (
            <CircleMarker
              center={[lastPoint.lat, lastPoint.lng]}
              radius={8}
              pathOptions={{
                color: '#f36f45',
                fillColor: '#ffd494',
                fillOpacity: 0.9,
                weight: 3
              }}
            >
              <Popup>
                {lastPoint.value.toFixed(2)} {lastPoint.unit}
                <br />
                {lastPoint.lat.toFixed(6)}, {lastPoint.lng.toFixed(6)}
                <br />
                {lastPoint.interpolated ? 'Posicion interpolada' : 'Posicion GPS real'}
              </Popup>
            </CircleMarker>
          ) : null}
        </MapContainer>
      </div>
    </section>
  )
}
