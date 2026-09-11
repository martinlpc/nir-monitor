import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { DeviceManagerStateDTO } from '../../../../shared/dto'
import type { DeviceId, PortInfo } from './types'

const INITIAL_DEVICE_STATE: DeviceManagerStateDTO = {
  nbm550: { id: null, port: null, status: 'disconnected', reconnecting: false },
  gps: {
    id: null,
    port: null,
    status: 'disconnected',
    reconnecting: false,
    garminWinusbMissing: false
  },
  scanning: false
}

export function useDebugDevices(appendLog: (type: string, message: string) => void): {
  ports: PortInfo[]
  deviceState: DeviceManagerStateDTO
  selectedPorts: Record<DeviceId, string>
  setDeviceState: Dispatch<SetStateAction<DeviceManagerStateDTO>>
  setSelectedPort: (deviceId: DeviceId, port: string) => void
  setSelectedPorts: Dispatch<SetStateAction<Record<DeviceId, string>>>
  refreshPorts: () => Promise<void>
  refreshDevices: () => Promise<void>
} {
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [deviceState, setDeviceState] = useState<DeviceManagerStateDTO>(INITIAL_DEVICE_STATE)
  const [selectedPorts, setSelectedPorts] = useState<Record<DeviceId, string>>({
    nbm550: '',
    gps: ''
  })

  const refreshPorts = useCallback(async (): Promise<void> => {
    const nextPorts = await window.api.ports.list()
    setPorts(nextPorts)
    setSelectedPorts((current) => ({
      nbm550: current.nbm550 || nextPorts[0]?.path || '',
      gps: current.gps || nextPorts[0]?.path || ''
    }))
    appendLog('ports', `Se listaron ${nextPorts.length} puertos`)
  }, [appendLog])

  const refreshDevices = useCallback(async (): Promise<void> => {
    const nextState = await window.api.devices.list()
    setDeviceState(nextState)
    setSelectedPorts((current) => ({
      nbm550: current.nbm550 || nextState.nbm550.port || '',
      gps: current.gps || nextState.gps.port || ''
    }))
  }, [])

  useEffect(() => {
    void (async () => {
      await refreshPorts()
      await refreshDevices()
    })().catch((err) => appendLog('error', err instanceof Error ? err.message : String(err)))

    const offStatus = window.api.devices.onStatus((data) => {
      setDeviceState((current) => ({
        ...current,
        [data.deviceId]: {
          ...current[data.deviceId as DeviceId],
          status: data.status
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

    return () => {
      offStatus()
      offError()
      offScan()
    }
  }, [appendLog, refreshPorts, refreshDevices])

  const setSelectedPort = useCallback(
    (deviceId: DeviceId, port: string) =>
      setSelectedPorts((current) => ({ ...current, [deviceId]: port })),
    []
  )

  return {
    ports,
    deviceState,
    selectedPorts,
    setDeviceState,
    setSelectedPort,
    setSelectedPorts,
    refreshPorts,
    refreshDevices
  }
}
