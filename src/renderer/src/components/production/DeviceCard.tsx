import { useEffect, useState, useRef } from 'react'
import './production.css'

type GpsInfo = {
  lat?: number
  lon?: number
  alt?: number
}

type NBMInfo = {
  rss?: number
  unit?: string
  battery?: number
}

interface DeviceInfo {
  id: string
  name: string
  type: 'emf' | 'gps'
  port: string
  baudRate: number
}

interface DeviceCardProps {
  device: DeviceInfo
  isLoading?: boolean
  onConnect?: () => void
  onDisconnect?: () => void
}

export default function DeviceCard({
  device,
  isLoading = false,
  onConnect,
  onDisconnect
}: DeviceCardProps): React.JSX.Element {
  const [status, setStatus] = useState<'connected' | 'connecting' | 'error' | 'disconnected'>('disconnected')
  const [gpsInfo, setGpsInfo] = useState<GpsInfo>({})
  const [nbmInfo, setNbmInfo] = useState<NBMInfo>({})
  const fixTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Escuchar cambios de estado del dispositivo
  useEffect(() => {
    const unsubscribe = window.api.devices.onStatus((data) => {
      if (data.deviceId === device.id) {
        setStatus(data.status as any)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [device.id])

  // Escuchar actualizaciones de GPS
  useEffect(() => {
    if (device.type !== 'gps') return

    const unsubscribePosition = window.api.gps.onPosition((data) => {
      if (data.coords) {
        if (fixTimeoutRef.current) {
          clearTimeout(fixTimeoutRef.current)
          fixTimeoutRef.current = null
        }

        setGpsInfo({
          lat: data.coords.lat,
          lon: data.coords.lon,
          alt: data.coords.alt
        })

        // Timeout para limpiar si no hay más posiciones
        fixTimeoutRef.current = setTimeout(() => {
          setGpsInfo({})
          fixTimeoutRef.current = null
        }, 5000)
      }
    })

    // Listen for GPS fix lost events
    const unsubscribeFixLost = window.api.gps.onPosition((data) => {
      if (!data.valid) {
        if (fixTimeoutRef.current) {
          clearTimeout(fixTimeoutRef.current)
          fixTimeoutRef.current = null
        }
        setGpsInfo({})
      }
    })

    return () => {
      unsubscribePosition()
      unsubscribeFixLost()
      if (fixTimeoutRef.current) {
        clearTimeout(fixTimeoutRef.current)
        fixTimeoutRef.current = null
      }
    }
  }, [device.type])

  // Escuchar actualizaciones del NBM550
  useEffect(() => {
    if (device.type !== 'emf') return

    const unsubscribe = window.api.nbm.onSample((data) => {
      setNbmInfo({
        rss: data.rss,
        unit: data.unit,
        battery: data.battery
      })
    })

    return () => {
      unsubscribe()
    }
  }, [device.type])

  const statusColor = {
    connected: '#4ade80',
    connecting: '#facc15',
    error: '#ef4444',
    disconnected: '#6b7280'
  }[status]

  const statusLabel = {
    connected: 'Conectado',
    connecting: 'Conectando...',
    error: 'Error',
    disconnected: 'Desconectado'
  }[status]

  const isConnected = status === 'connected'
  const hasPort = device.port !== 'No detectado'
  const isAutoConnected = device.type === 'gps' && isConnected
  const hasGPSFix = gpsInfo.lat !== undefined && gpsInfo.lon !== undefined

  // Para GPS sin fix: cambiar color del LED a rojo
  let displayStatusColor = statusColor
  if (device.type === 'gps' && isConnected && !hasGPSFix) {
    displayStatusColor = '#ef4444'
  }

  return (
    <div className="device-card">
      <div className="device-header">
        <div className="device-title">
          <div
            className="status-dot"
            style={{ backgroundColor: displayStatusColor }}
            title={statusLabel}
          />
          <div>
            <h3 className="device-name">
              {device.type === 'gps' ? 'GPS (NMEA)' : device.name}
              {isAutoConnected && (
                <span style={{ fontSize: '0.7em', marginLeft: '8px', color: '#4ade80' }}>
                  🔗 AUTO
                </span>
              )}
            </h3>
            <p className="device-type">{device.type.toUpperCase()}</p>
          </div>
        </div>
        <span className="device-status">{statusLabel}</span>
      </div>

      <div className="device-info">
        {device.type === 'gps' && isConnected && (
          <>
            {hasGPSFix ? (
              <>
                <div className="info-row primary">
                  <span className="info-label">Posición:</span>
                  <span className="info-value">
                    {gpsInfo.lat?.toFixed(6) ?? '-'}°, {gpsInfo.lon?.toFixed(6) ?? '-'}°
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Altitud:</span>
                  <span className="info-value">{gpsInfo.alt?.toFixed(1) ?? '-'} m</span>
                </div>
              </>
            ) : (
              <div className="info-row primary" style={{ justifyContent: 'center', color: '#fca5a5' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Buscando posición...</span>
              </div>
            )}
          </>
        )}

        {device.type === 'emf' && nbmInfo.rss !== undefined && (
          <>
            <div className="info-row primary">
              <span className="info-label">Nivel:</span>
              <span className="info-value">
                {nbmInfo.rss?.toFixed(2) ?? '-'} {nbmInfo.unit ?? 'V/m'}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Batería:</span>
              <span className="info-value">{nbmInfo.battery ?? 0}%</span>
            </div>
            <div className="info-row">
              <span className="info-label">Puerto:</span>
              <span className={`info-value ${!hasPort ? 'no-port' : ''}`}>{device.port}</span>
            </div>
          </>
        )}
      </div>

      <div className="device-actions">
        {isConnected ? (
          <button className="btn-disconnect" onClick={onDisconnect} disabled={isLoading}>
            {isLoading ? 'Desconectando...' : 'Desconectar'}
          </button>
        ) : (
          <button
            className="btn-connect primary"
            onClick={onConnect}
            disabled={isLoading || !hasPort}
            title={!hasPort ? 'Puerto no detectado - ejecuta escaneo' : ''}
          >
            {isLoading ? 'Conectando...' : 'Conectar'}
          </button>
        )}
      </div>
    </div>
  )
}
