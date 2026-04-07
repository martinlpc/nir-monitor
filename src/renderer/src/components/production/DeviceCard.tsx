import type { DeviceStatus } from '../../../../shared/device.types'
import { useGpsCardInfo, useNbmCardInfo } from './useDeviceCardState'
import './production.css'

interface DeviceInfo {
  id: string
  name: string
  type: 'emf' | 'gps'
  port: string
  baudRate: number
}

interface DeviceCardProps {
  device: DeviceInfo
  status: DeviceStatus
  isLoading?: boolean
  onConnect?: () => void
  onDisconnect?: () => void
}

export default function DeviceCard({
  device,
  status,
  isLoading = false,
  onConnect,
  onDisconnect
}: DeviceCardProps): React.JSX.Element {
  const gpsInfo = useGpsCardInfo(device.type === 'gps')
  const nbmInfo = useNbmCardInfo(device.type === 'emf', status)

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
            role="status"
            aria-label={`Estado: ${statusLabel}`}
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
