import { useEffect, useState } from 'react'
import type { DeviceMeta, DeviceStatus } from '../../../../shared/device.types'
import DeviceCard from './DeviceCard'
import './production.css'

type SessionState = 'idle' | 'starting' | 'active' | 'stopping'

interface DevicesPanelProps {
  onSessionStateChange?: (state: SessionState) => void
}

interface DeviceState {
  nbm550: { port: string | null; status: DeviceStatus }
  gps: { port: string | null; status: DeviceStatus }
  scanning: boolean
}

// Dispositivos conocidos - SIEMPRE mostrados
const KNOWN_DEVICES: Record<string, { name: string; type: 'emf' | 'gps'; baudRate: number }> = {
  nbm550: { name: 'NBM-550', type: 'emf', baudRate: 460800 },
  gps: { name: 'GPS (Primary)', type: 'gps', baudRate: 4800 }
}

// Convertir el estado del DeviceManager para construir DeviceMeta con puerto (o sin)
function stateToDevices(state: DeviceState): DeviceMeta[] {
  const devices: DeviceMeta[] = []

  // NBM-550 - SIEMPRE mostrado
  devices.push({
    id: 'nbm550',
    name: KNOWN_DEVICES.nbm550.name,
    type: KNOWN_DEVICES.nbm550.type,
    port: state.nbm550.port || 'No detectado',
    baudRate: KNOWN_DEVICES.nbm550.baudRate
  })

  // GPS - SIEMPRE mostrado
  devices.push({
    id: 'gps',
    name: KNOWN_DEVICES.gps.name,
    type: KNOWN_DEVICES.gps.type,
    port: state.gps.port || 'No detectado',
    baudRate: KNOWN_DEVICES.gps.baudRate
  })

  return devices
}

export default function DevicesPanel({
  onSessionStateChange
}: DevicesPanelProps): React.JSX.Element {
  const [devices, setDevices] = useState<DeviceMeta[]>([])
  const [deviceState, setDeviceState] = useState<DeviceState | null>(null)
  const [sessionState, setSessionState] = useState<SessionState>('idle')
  const [loadingDevice, setLoadingDevice] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)

  // Cargar dispositivos inicialmente
  useEffect(() => {
    const loadDevices = async (): Promise<void> => {
      try {
        const state = (await window.api.devices.list()) as DeviceState
        setDeviceState(state)
        setDevices(stateToDevices(state))
      } catch (err) {
        console.error('Error loading devices:', err)
      }
    }

    loadDevices()
  }, [])

  // Escuchar cambios en el scan de dispositivos
  useEffect(() => {
    const unsubscribeScan = window.api.devices.onScanState((state: DeviceState) => {
      setDeviceState(state)
      setDevices(stateToDevices(state))
    })

    // También escuchar cambios individuales de estado
    const unsubscribeStatus = window.api.devices.onStatus((data: { deviceId: string; status: string }) => {
      setDeviceState((prev) => {
        if (!prev) return prev
        const updated = { ...prev }
        if (data.deviceId === 'nbm550') {
          updated.nbm550 = { ...updated.nbm550, status: data.status as any }
        } else if (data.deviceId === 'gps') {
          updated.gps = { ...updated.gps, status: data.status as any }
        }
        setDevices(stateToDevices(updated))
        return updated
      })
    })

    return () => {
      unsubscribeScan()
      unsubscribeStatus()
    }
  }, [])

  // Escuchar eventos de sesión
  useEffect(() => {
    const unsubStart = window.api.session.onStarted(() => {
      setSessionState('active')
      onSessionStateChange?.('active')
    })

    const unsubStop = window.api.session.onStopped(() => {
      setSessionState('idle')
      onSessionStateChange?.('idle')
    })

    return () => {
      unsubStart()
      unsubStop()
    }
  }, [onSessionStateChange])

  const handleConnect = async (deviceId: string): Promise<void> => {
    setLoadingDevice(deviceId)
    try {
      await window.api.devices.connect(deviceId as 'nbm550' | 'gps')
    } catch (err) {
      console.error('Error connecting device:', err)
    } finally {
      setLoadingDevice(null)
    }
  }

  const handleDisconnect = async (deviceId: string): Promise<void> => {
    setLoadingDevice(deviceId)
    try {
      await window.api.devices.disconnect(deviceId as 'nbm550' | 'gps')
    } catch (err) {
      console.error('Error disconnecting device:', err)
    } finally {
      setLoadingDevice(null)
    }
  }

  const handleStartSession = async (): Promise<void> => {
    setSessionState('starting')
    try {
      await window.api.session.start({
        label: `Sesión ${new Date().toLocaleString()}`
      })
    } catch (err) {
      console.error('Error starting session:', err)
      setSessionState('idle')
    }
  }

  const handleStopSession = async (): Promise<void> => {
    setSessionState('stopping')
    try {
      await window.api.session.stop()
    } catch (err) {
      console.error('Error stopping session:', err)
      setSessionState('active')
    }
  }

  const handleScan = async (): Promise<void> => {
    setIsScanning(true)
    try {
      const state = (await window.api.devices.scan()) as DeviceState
      setDeviceState(state)
      setDevices(stateToDevices(state))
    } catch (err) {
      console.error('Error scanning devices:', err)
    } finally {
      setIsScanning(false)
    }
  }

  const allConnected =
    deviceState?.nbm550.status === 'connected' && deviceState?.gps.status === 'connected'

  return (
    <aside className="devices-panel">
      <div className="panel-header">
        <h2>Dispositivos</h2>
        <button
          className="btn-scan"
          onClick={handleScan}
          disabled={isScanning}
          title="Escanear puertos disponibles"
        >
          {isScanning ? '⟳ Escaneando...' : '⟳ Escanear'}
        </button>
      </div>

      <div className="devices-list">
        {devices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            isLoading={loadingDevice === device.id}
            onConnect={() => handleConnect(device.id)}
            onDisconnect={() => handleDisconnect(device.id)}
          />
        ))}
      </div>

      <div className="session-controls">
        <h3>Control de Sesión</h3>
        <div className="button-group">
          {sessionState === 'idle' ? (
            <button
              className="btn-session btn-start primary"
              onClick={handleStartSession}
              disabled={sessionState !== 'idle' || !allConnected}
            >
              ▶ Iniciar
            </button>
          ) : (
            <>
              <button
                className="btn-session btn-pause"
                onClick={handleStopSession}
                disabled={sessionState !== 'active'}
              >
                ⏹ Detener
              </button>
            </>
          )}
        </div>
        <p className="session-status">
          Estado: <strong>{sessionState === 'active' ? 'En grabación' : 'Inactivo'}</strong>
        </p>
      </div>
    </aside>
  )
}
