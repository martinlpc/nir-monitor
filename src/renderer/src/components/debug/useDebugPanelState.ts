import { useEffect, useState } from 'react'
import type { GeoTimestamp } from '../../../../shared/GeoTimestamp'
import type { SessionSummary } from '../../../../shared/ipc.types'
import type { DebugPanelState, DeviceId, TriggerMode } from './types'
import { useDebugLogs } from './useDebugLogs'
import { useDebugDevices } from './useDebugDevices'
import { useDebugGps } from './useDebugGps'

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
  const { logs, appendLog, clearLogs } = useDebugLogs()
  const {
    ports,
    deviceState,
    selectedPorts,
    setDeviceState,
    setSelectedPort,
    setSelectedPorts,
    refreshPorts,
    refreshDevices
  } = useDebugDevices(appendLog)
  const { gpsFix, gpsText, nmeaLines, clearNmeaLines } = useDebugGps()

  const [sessionLabel, setSessionLabel] = useState('Prueba de campo')
  const [triggerMode, setTriggerMode] = useState<TriggerMode>('distance')
  const [minDistanceMeters, setMinDistanceMeters] = useState('10')
  const [intervalMs, setIntervalMs] = useState('5000')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null)
  const [lastSample, setLastSample] = useState<GeoTimestamp | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

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

  useEffect(() => {
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
      offSample()
      offStarted()
      offStopped()
    }
  }, [appendLog])

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
      setSelectedPort,
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
      clearLogs,
      clearNmeaLines
    }
  }
}
