import { useState } from 'react'
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
  followPosition?: boolean
  onFollowPositionChange?: (value: boolean) => void
}

export default function DeviceCard({
  device,
  status,
  isLoading = false,
  onConnect,
  onDisconnect,
  followPosition,
  onFollowPositionChange
}: DeviceCardProps): React.JSX.Element {
  const gpsInfo = useGpsCardInfo(device.type === 'gps')
  const nbmInfo = useNbmCardInfo(device.type === 'emf', status)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const isConnected = status === 'connected'
  const isStandby = device.type === 'emf' && isConnected && nbmInfo.mode === 'standby'

  const statusColor = isStandby
    ? '#3b82f6'
    : {
        connected: '#4ade80',
        connecting: '#facc15',
        error: '#ef4444',
        disconnected: '#6b7280'
      }[status]

  const statusLabel = isStandby
    ? 'Standby'
    : {
        connected: 'Conectado',
        connecting: 'Conectando...',
        error: 'Error',
        disconnected: 'Desconectado'
      }[status]
  const hasPort = device.port !== 'No detectado'
  const hasGPSFix = gpsInfo.lat !== undefined && gpsInfo.lon !== undefined

  // Para GPS sin fix: cambiar color del LED a rojo
  let displayStatusColor = statusColor
  if (device.type === 'gps' && isConnected && !hasGPSFix) {
    displayStatusColor = '#ef4444'
  }

  return (
    <div className="device-card" onMouseLeave={() => setConfirmDisconnect(false)}>
      <div className="device-header">
        <div className="device-title">
          <div
            className="status-dot"
            style={{ backgroundColor: displayStatusColor }}
            role="status"
            aria-label={`Estado: ${statusLabel}`}
          />
          <div>
            <h3 className="device-name">{device.type === 'gps' ? 'GPS (NMEA)' : device.name}</h3>
            <p className="device-type">
              {device.type === 'emf' ? 'Medidor de RNI' : device.type.toUpperCase()}
            </p>
          </div>
        </div>
        <div className="device-header-end">
          {device.type === 'emf' && isConnected && nbmInfo.battery !== undefined && (
            <span className="battery-indicator">🔋{nbmInfo.battery}%</span>
          )}
          <span className="device-status">{statusLabel}</span>
        </div>
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
                {gpsInfo.alt != null && (
                  <div className="info-row primary">
                    <span className="info-label">Altitud:</span>
                    <span className="info-value">{gpsInfo.alt.toFixed(1)}m</span>
                  </div>
                )}
                <label
                  className="test-mode-checkbox"
                  style={{ marginTop: '2px', marginBottom: '4px', padding: '0.25rem 0.5rem' }}
                >
                  <input
                    type="checkbox"
                    checked={!!followPosition}
                    onChange={(e) => onFollowPositionChange?.(e.target.checked)}
                  />
                  <span style={{ fontSize: '0.7rem' }}>Seguir mi posición</span>
                </label>
                <div className="device-info-separator" />
              </>
            ) : (
              <div
                className="info-row primary"
                style={{ justifyContent: 'center', color: '#fca5a5' }}
              >
                <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>Buscando posición...</span>
              </div>
            )}
          </>
        )}

        {device.type === 'emf' && (
          <>
            {nbmInfo.rss !== undefined ? (
              <div className="info-row primary">
                <span className="info-label">Nivel:</span>
                <span className="info-value">
                  {nbmInfo.rss?.toFixed(2) ?? '-'} {nbmInfo.unit ?? 'V/m'}
                </span>
              </div>
            ) : isConnected && nbmInfo.mode === 'standby' ? (
              <div className="info-row primary" style={{ justifyContent: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '600' }}>
                  Standby — sin medición
                </span>
              </div>
            ) : null}
            {nbmInfo.probeModel && (
              <div className="info-row">
                <span className="info-label">Sonda:</span>
                <span className="info-value">
                  {nbmInfo.probeModel}
                  {nbmInfo.probeSerial ? ` (#${nbmInfo.probeSerial})` : ''}
                  {nbmInfo.calibrationDate ? `  |  ${nbmInfo.calibrationDate}` : ''}
                </span>
              </div>
            )}
            {nbmInfo.meterCalDate && (
              <div className="info-row">
                <span className="info-label">Cal. instrumento:</span>
                <span className="info-value">{nbmInfo.meterCalDate}</span>
              </div>
            )}
            <div className="info-row">
              <span className="info-label">Puerto:</span>
              <span className={`info-value ${!hasPort ? 'no-port' : ''}`}>{device.port}</span>
            </div>
          </>
        )}
      </div>

      <div className="device-actions">
        {isConnected ? (
          confirmDisconnect ? (
            <div className="disconnect-confirm-group">
              <button
                className="btn-disconnect-confirm btn-disconnect-accept"
                onClick={() => {
                  onDisconnect?.()
                  setConfirmDisconnect(false)
                }}
                disabled={isLoading}
                title="Confirmar desconexión"
                aria-label="Confirmar desconexión"
              >
                ✓
              </button>
              <button
                className="btn-disconnect-confirm btn-disconnect-cancel"
                onClick={() => setConfirmDisconnect(false)}
                title="Cancelar"
                aria-label="Cancelar desconexión"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              className="btn-disconnect"
              onClick={() => setConfirmDisconnect(true)}
              disabled={isLoading}
            >
              {isLoading ? 'Desconectando...' : 'Desconectar'}
            </button>
          )
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
