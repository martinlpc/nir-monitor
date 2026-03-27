import { useEffect, useState } from 'react'
import type { DeviceManagerState } from '../../../../main/services/DeviceManager'
import type { GeoTimestamp } from '../../../../shared/GeoTimestamp'
import type { SessionSummary } from '../../../../shared/ipc.types'
import type {
  DebugPanelState,
  DeviceId,
  LogEntry,
  NmeaEntry,
  PortInfo,
  TriggerMode
} from './types'

const INITIAL_DEVICE_STATE: DeviceManagerState = {
  nbm550: { port: null, status: 'disconnected' },
  gps: { port: null, status: 'disconnected' },
  scanning: false
}

interface DebugPanelActions {
  setSessionLabel: (value: string) => void
  setTriggerMode: (value: TriggerMode) => void
  setMinDistanceMeters: (value: string) => void
  setIntervalMs: (value: string) => void
  setSelectedPort: (deviceId: DeviceId, port: string) => void
  refreshPorts: () => Promise<void>
  refreshDevices: () => Promise<void>
  setPort: (deviceId: DeviceId) => Promise<void>
  connectDevice: (deviceId: DeviceId) => Promise<void>
  disconnectDevice: (deviceId: DeviceId) => Promise<void>
  scanDevices: () => Promise<void>
  startSession: () => Promise<void>
  stopSession: () => Promise<void>
  clearLogs: () => void
  clearNmeaLines: () => void
}

export function useDebugPanelState(): { state: DebugPanelState; actions: DebugPanelActions } {
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [deviceState, setDeviceState] = useState<DeviceManagerState>(INITIAL_DEVICE_STATE)
  const [selectedPorts, setSelectedPorts] = useState<Record<DeviceId, string>>({
    nbm550: '',
    gps: ''
  })
  const [sessionLabel, setSessionLabel] = useState('Prueba de campo')
  const [triggerMode, setTriggerMode] = useState<TriggerMode>('distance')
  const [minDistanceMeters, setMinDistanceMeters] = useState('10')
  const [intervalMs, setIntervalMs] = useState('5000')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null)
  const [lastSample, setLastSample] = useState<GeoTimestamp | null>(null)
  const [gpsFix, setGpsFix] = useState(false)
  const [gpsText, setGpsText] = useState('Sin datos')
  const [nmeaLines, setNmeaLines] = useState<NmeaEntry[]>([])
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])

  const appendLog = (type: string, message: string): void => {
    setLogs((current) =>
      [
        {
          id: Date.now() + Math.random(),
          timestamp: new Date().toLocaleTimeString('es-AR', { hour12: false }),
          type,
          message
        },
        ...current
      ].slice(0, 80)
    )
  }

  const runAction = async (label: string, action: () => Promise<void>): Promise<void> => {
    setBusyAction(label)
    try {
      await action()
    } catch (error) {
      appendLog('error', error instanceof Error ? error.message : 'Error desconocido')
    } finally {
      setBusyAction(null)
    }
  }

  const refreshPorts = async (): Promise<void> => {
    const nextPorts = await window.api.ports.list()
    setPorts(nextPorts)
    setSelectedPorts((current) => ({
      nbm550: current.nbm550 || nextPorts[0]?.path || '',
      gps: current.gps || nextPorts[0]?.path || ''
    }))
    appendLog('ports', `Se listaron ${nextPorts.length} puertos`)
  }

  const refreshDevices = async (): Promise<void> => {
    const nextState = await window.api.devices.list()
    setDeviceState(nextState)
    setSelectedPorts((current) => ({
      nbm550: current.nbm550 || nextState.nbm550.port || '',
      gps: current.gps || nextState.gps.port || ''
    }))
  }

  useEffect(() => {
    void runAction('bootstrap', async () => {
      await refreshPorts()
      await refreshDevices()
    })

    const offStatus = window.api.devices.onStatus((data) => {
      setDeviceState((current) => ({
        ...current,
        [data.deviceId]: {
          ...current[data.deviceId as DeviceId],
          status: data.status as DeviceManagerState[DeviceId]['status']
        }
      }))
      appendLog('device:status', `${data.deviceId} -> ${data.status}`)
    })

    const offError = window.api.devices.onError((data) => {
      appendLog('device:error', `${data.deviceId}: ${data.error}`)
    })

    const offScan = window.api.devices.onScanState((state) => {
      setDeviceState(state)
      appendLog(
        'scan',
        `scan=${state.scanning} nbm=${state.nbm550.port ?? '-'} gps=${state.gps.port ?? '-'}`
      )
    })

    const offGps = window.api.gps.onPosition((data) => {
      setGpsFix(data.valid)

      if (!data.coords) {
        setGpsText(`GPS ${data.valid ? 'valido' : 'sin fix'}`)
        return
      }

      setGpsText(
        `${data.valid ? 'fix' : 'sin fix'} lat=${data.coords.lat.toFixed(6)} lon=${data.coords.lon.toFixed(6)} alt=${data.coords.alt.toFixed(1)}`
      )
    })

    const offNmea = window.api.gps.onNmea((data) => {
      setNmeaLines((current) =>
        [
          {
            id: Date.now() + Math.random(),
            timestamp: new Date().toLocaleTimeString('es-AR', { hour12: false }),
            port: data.port,
            line: data.line
          },
          ...current
        ].slice(0, 30)
      )
    })

    const offSample = window.api.session.onSample((point) => {
      setLastSample(point)
      appendLog(
        'sample',
        `rss=${point.emf.rss} ${point.emf.unit} @ ${point.position.lat.toFixed(6)}, ${point.position.lon.toFixed(6)}`
      )
    })

    const offStarted = window.api.session.onStarted((data) => {
      setSessionId(data.sessionId)
      setSessionSummary(null)
      appendLog('session:start', `${data.label} (${data.sessionId})`)
    })

    const offStopped = window.api.session.onStopped((data) => {
      setSessionSummary(data)
      setSessionId(null)
      appendLog('session:stop', `${data.label} | muestras=${data.sampleCount}`)
    })

    return () => {
      offStatus()
      offError()
      offScan()
      offGps()
      offNmea()
      offSample()
      offStarted()
      offStopped()
    }
  }, [])

  return {
    state: {
      ports,
      deviceState,
      selectedPorts,
      sessionLabel,
      triggerMode,
      minDistanceMeters,
      intervalMs,
      sessionId,
      sessionSummary,
      lastSample,
      gpsFix,
      gpsText,
      nmeaLines,
      busyAction,
      logs
    },
    actions: {
      setSessionLabel,
      setTriggerMode,
      setMinDistanceMeters,
      setIntervalMs,
      setSelectedPort: (deviceId, port) =>
        setSelectedPorts((current) => ({ ...current, [deviceId]: port })),
      refreshPorts: () => runAction('refreshPorts', refreshPorts),
      refreshDevices: () =>
        runAction('devices.list', async () => {
          await refreshDevices()
          appendLog('device:list', 'Estado actualizado')
        }),
      setPort: (deviceId) =>
        runAction(`setPort:${deviceId}`, async () => {
          const state = await window.api.devices.setPort(deviceId, selectedPorts[deviceId])
          setDeviceState(state)
          appendLog('device:set-port', `${deviceId} -> ${selectedPorts[deviceId]}`)
        }),
      connectDevice: (deviceId) =>
        runAction(`connect:${deviceId}`, async () => {
          await window.api.devices.connect(deviceId)
          appendLog('device:connect', deviceId)
        }),
      disconnectDevice: (deviceId) =>
        runAction(`disconnect:${deviceId}`, async () => {
          await window.api.devices.disconnect(deviceId)
          await refreshDevices()
          appendLog('device:disconnect', deviceId)
        }),
      scanDevices: () =>
        runAction('scan', async () => {
          const state = await window.api.devices.scan()
          setDeviceState(state)
          setSelectedPorts((current) => ({
            nbm550: state.nbm550.port ?? current.nbm550,
            gps: state.gps.port ?? current.gps
          }))
          appendLog('scan', 'Escaneo manual completado')
        }),
      startSession: () =>
        runAction('session.start', async () => {
          const nextSessionId = await window.api.session.start({
            label: sessionLabel,
            triggerMode,
            minDistanceMeters: Number(minDistanceMeters),
            intervalMs: Number(intervalMs)
          })
          setSessionId(nextSessionId)
        }),
      stopSession: () =>
        runAction('session.stop', async () => {
          const summary = await window.api.session.stop()
          setSessionSummary(summary)
          setSessionId(null)
        }),
      clearLogs: () => setLogs([]),
      clearNmeaLines: () => setNmeaLines([])
    }
  }
}
