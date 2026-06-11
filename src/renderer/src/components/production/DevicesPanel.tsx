import { useEffect, useState } from 'react'
import type { useDevices } from '../../hooks/useDevices'
import type { useSession } from '../../hooks/useSession'
import { generateSessionName, haversineMeters } from '../../utils/geolocation'
import { formatDurationMs } from '../../utils/formatters'
import { useGpsPosition } from '../../hooks/useGpsPosition'
import DeviceCard from './DeviceCard'
import SessionStartModal from '../SessionStartModal'
import './production.css'

interface DevicesPanelProps {
  devices: ReturnType<typeof useDevices>
  session: ReturnType<typeof useSession>
  followPosition: boolean
  onFollowPositionChange: (value: boolean) => void
}

// Dispositivos conocidos - SIEMPRE mostrados
const KNOWN_DEVICE_IDS = ['nbm550', 'gps'] as const
type KnownDeviceId = (typeof KNOWN_DEVICE_IDS)[number]

const KNOWN_DEVICES: Record<
  KnownDeviceId,
  { name: string; type: 'emf' | 'gps'; baudRate: number }
> = {
  nbm550: { name: 'NBM-550', type: 'emf', baudRate: 460800 },
  gps: { name: 'GPS (Primary)', type: 'gps', baudRate: 4800 }
}

export default function DevicesPanel({
  devices,
  session,
  followPosition,
  onFollowPositionChange
}: DevicesPanelProps): React.JSX.Element {
  const [loadingDevice, setLoadingDevice] = useState<string | null>(null)
  const [testMode, setTestMode] = useState(false)
  const [showTestMode, setShowTestMode] = useState(false)
  const [sessionName, setSessionName] = useState('')
  const [triggerMode, setTriggerMode] = useState<'distance' | 'time'>('distance')
  const [minDistanceMeters, setMinDistanceMeters] = useState(10)
  const [intervalSec, setIntervalSec] = useState(5)
  const [confirmStop, setConfirmStop] = useState(false)
  const [showStartModal, setShowStartModal] = useState(false)
  const { position } = useGpsPosition()

  // Ctrl+Alt+D togglea visibilidad del modo test
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        setShowTestMode((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Handlers que usan los hooks
  const handleConnect = async (deviceId: KnownDeviceId): Promise<void> => {
    setLoadingDevice(deviceId)
    try {
      const device = deviceId === 'nbm550' ? devices.nbm550 : devices.gps
      if (device?.port) {
        // Ya tiene puerto, solo conectar
        await devices.connect(deviceId)
      } else {
        // Necesita escanear primero
        throw new Error(`${deviceId} no tiene puerto configurado`)
      }
    } catch (err) {
      console.error(`Error conectando ${deviceId}:`, err)
    } finally {
      setLoadingDevice(null)
    }
  }

  const handleDisconnect = async (deviceId: KnownDeviceId): Promise<void> => {
    setLoadingDevice(deviceId)
    try {
      await devices.disconnect(deviceId)
    } catch (err) {
      console.error(`Error desconectando ${deviceId}:`, err)
    } finally {
      setLoadingDevice(null)
    }
  }

  const handleStartSession = async (locationData?: {
    provincia: string
    localidad: string
    apellido1: string
    apellido2: string
  }): Promise<void> => {
    try {
      // Intentar obtener posición GPS actual para el nombre
      const gpsStatus = devices.gps?.status
      let sessionLabel: string

      if (gpsStatus === 'connected') {
        // Pedir posición actual una sola vez de forma síncrona
        sessionLabel = await new Promise<string>((resolve) => {
          const unsub = window.api.gps.onPosition(async (data) => {
            unsub()
            if (data.valid && data.coords) {
              const name = await generateSessionName(data.coords)
              resolve(name)
            } else {
              const name = await generateSessionName()
              resolve(name)
            }
          })
          // Si no llega posición en 1s, generar nombre sin ubicación
          setTimeout(async () => {
            unsub()
            const name = await generateSessionName()
            resolve(name)
          }, 1000)
        })
      } else {
        sessionLabel = await generateSessionName()
      }

      let finalLabel = sessionName.trim()
      if (!finalLabel && locationData?.localidad) {
        const now = new Date()
        const fecha = now.toISOString().slice(0, 10)
        const hora = now.toTimeString().slice(0, 8).replace(/:/g, '')
        finalLabel = `${locationData.localidad} ${fecha} ${hora}`
      }
      if (!finalLabel) finalLabel = sessionLabel

      await session.start({
        label: finalLabel,
        testMode,
        triggerMode,
        minDistanceMeters,
        intervalMs: intervalSec * 1000,
        ...(locationData
          ? {
              provincia: locationData.provincia,
              localidad: locationData.localidad,
              apellido1: locationData.apellido1,
              apellido2: locationData.apellido2
            }
          : {})
      })
      setSessionName('')
    } catch (err) {
      console.error('Error starting session:', err)
    }
  }

  const handleStopSession = async (): Promise<void> => {
    try {
      await session.stop()
    } catch (err) {
      console.error('Error stopping session:', err)
    }
  }

  // Construir lista de dispositivos para mostrar
  const devicesList = KNOWN_DEVICE_IDS.map((id) => ({
    id,
    name: KNOWN_DEVICES[id].name,
    type: KNOWN_DEVICES[id].type,
    port: (id === 'nbm550' ? devices.nbm550?.port : devices.gps?.port) || 'No detectado',
    baudRate: KNOWN_DEVICES[id].baudRate
  }))

  const allConnected = devices.isConnected('nbm550') && devices.isConnected('gps')

  return (
    <aside className="devices-panel">
      <div className="panel-header">
        <h2>Dispositivos</h2>
        <button
          className="btn-scan"
          onClick={() => devices.scan()}
          disabled={devices.scanning}
          title="Escanear puertos disponibles"
        >
          {devices.scanning ? '⟳ Escaneando...' : '⟳ Escanear'}
        </button>
      </div>

      <div className="devices-list">
        {devicesList.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            status={
              (device.id === 'nbm550' ? devices.nbm550?.status : devices.gps?.status) ??
              'disconnected'
            }
            isLoading={loadingDevice === device.id}
            onConnect={() => handleConnect(device.id)}
            onDisconnect={() => handleDisconnect(device.id)}
            followPosition={device.type === 'gps' ? followPosition : undefined}
            onFollowPositionChange={device.type === 'gps' ? onFollowPositionChange : undefined}
          />
        ))}
      </div>

      <div className="panel-footer">
        {!session.isRunning && (
          <input
            type="text"
            className="session-name-input"
            placeholder="Nombre de la sesión (opcional)"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            maxLength={100}
            aria-label="Nombre de la sesión"
          />
        )}

        {!session.isRunning && (
          <div className="trigger-mode-group">
            <span className="trigger-mode-label">Modo de captura</span>
            <div className="toggle-switch" data-active={triggerMode}>
              <button
                className={`toggle-option${triggerMode === 'distance' ? ' active' : ''}`}
                onClick={() => setTriggerMode('distance')}
              >
                Distancia
              </button>
              <button
                className={`toggle-option${triggerMode === 'time' ? ' active' : ''}`}
                onClick={() => setTriggerMode('time')}
              >
                Tiempo
              </button>
              <div className="toggle-slider" />
            </div>
            {triggerMode === 'distance' ? (
              <label className="trigger-value-row">
                <span>Distancia mínima:</span>
                <input
                  type="number"
                  className="trigger-value-input"
                  value={minDistanceMeters}
                  onChange={(e) => setMinDistanceMeters(Number(e.target.value))}
                  min={1}
                  max={1000}
                />
                <span>m</span>
              </label>
            ) : (
              <label className="trigger-value-row">
                <span>Intervalo:</span>
                <input
                  type="number"
                  className="trigger-value-input"
                  value={intervalSec}
                  onChange={(e) => setIntervalSec(Number(e.target.value))}
                  min={1}
                  max={3600}
                />
                <span>seg</span>
              </label>
            )}
          </div>
        )}

        {showTestMode && (
          <label className="test-mode-checkbox">
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
              disabled={session.isRunning}
              title="Modo test: toma puntos sin umbral de distancia"
            />
            <span>Modo Test</span>
          </label>
        )}

        {session.isRunning && confirmStop ? (
          <div className="session-stop-confirm">
            <button
              className="btn-stop-confirm btn-stop-accept"
              onClick={() => {
                handleStopSession()
                setConfirmStop(false)
              }}
              title="Confirmar detener sesión"
              aria-label="Confirmar detener sesión"
            >
              ✓ Detener
            </button>
            <button
              className="btn-stop-confirm btn-stop-cancel"
              onClick={() => setConfirmStop(false)}
              title="Cancelar"
              aria-label="Cancelar"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            className={`btn-session ${session.isRunning ? 'btn-pause' : 'btn-start'}`}
            onClick={session.isRunning ? () => setConfirmStop(true) : () => setShowStartModal(true)}
            disabled={!allConnected}
            title={
              allConnected ? 'Iniciar/detener sesión de medición' : 'Conecta ambos dispositivos'
            }
          >
            {session.isRunning ? '⏹ Detener sesión' : '▶ Iniciar sesión de medición'}
          </button>
        )}

        {session.isRunning && (
          <div className="session-info">
            <span>Puntos: {session.pointCount}</span>
            <span>Duración: {formatDurationMs(session.duration)}</span>
            <span>
              {triggerMode === 'distance' ? `📍 ${minDistanceMeters}m` : `⏱ ${intervalSec}s`}
            </span>
            {position && session.points.length > 0 && (
              <span>
                📏{' '}
                {haversineMeters(
                  position,
                  session.points[session.points.length - 1].position
                ).toFixed(1)}
                m
              </span>
            )}
          </div>
        )}
      </div>

      {showStartModal && (
        <SessionStartModal
          onConfirm={(data) => {
            setShowStartModal(false)
            handleStartSession(data)
          }}
          onCancel={() => setShowStartModal(false)}
        />
      )}
    </aside>
  )
}
