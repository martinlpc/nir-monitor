import { contextBridge, ipcRenderer } from 'electron'
import type { GeoTimestamp, GeoPosition } from '../shared/GeoTimestamp'
import type { DeviceManagerState } from '../main/services/DeviceManager'
import type { SessionSummary } from '../shared/ipc.types'
import { IPC_EVENTS, IPC_HANDLERS } from '../main/ipc/channels'

// -- API expuesta al Renderer via window.api ----------------------------
const api = {
  // -- Puertos y dispositivos -------------------------------------------

  ports: {
    list: (): Promise<{ path: string; manufacturer: string }[]> =>
      ipcRenderer.invoke(IPC_HANDLERS.PORTS_LIST)
  },

  devices: {
    list: (): Promise<DeviceManagerState> => ipcRenderer.invoke(IPC_HANDLERS.DEVICE_LIST),

    scan: (): Promise<DeviceManagerState> => ipcRenderer.invoke(IPC_HANDLERS.DEVICE_SCAN),

    setPort: (device: 'nbm550' | 'gps', port: string): Promise<DeviceManagerState> =>
      ipcRenderer.invoke(IPC_HANDLERS.DEVICE_SET_PORT, device, port),

    connect: (deviceId: 'nbm550' | 'gps'): Promise<void> =>
      ipcRenderer.invoke(IPC_HANDLERS.DEVICE_CONNECT, deviceId),

    disconnect: (deviceId: 'nbm550' | 'gps'): Promise<void> =>
      ipcRenderer.invoke(IPC_HANDLERS.DEVICE_DISCONNECT, deviceId),

    onStatus: (cb: (data: { deviceId: string; status: string }) => void) => {
      ipcRenderer.on(IPC_EVENTS.DEVICE_STATUS, (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners(IPC_EVENTS.DEVICE_STATUS)
    },

    onError: (cb: (data: { deviceId: string; error: string }) => void) => {
      ipcRenderer.on(IPC_EVENTS.DEVICE_ERROR, (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners(IPC_EVENTS.DEVICE_ERROR)
    },

    onScanState: (cb: (state: DeviceManagerState) => void) => {
      ipcRenderer.on(IPC_EVENTS.SCAN_STATE, (_, state) => cb(state))
      return () => ipcRenderer.removeAllListeners(IPC_EVENTS.SCAN_STATE)
    }
  },

  // -- GPS -----------------------------------------------------------------

  gps: {
    onPosition: (cb: (data: { coords: GeoPosition; valid: boolean }) => void) => {
      ipcRenderer.on(IPC_EVENTS.GPS_POSITION, (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners(IPC_EVENTS.GPS_POSITION)
    },

    onNmea: (cb: (data: { line: string; port: string }) => void) => {
      ipcRenderer.on(IPC_EVENTS.GPS_NMEA, (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners(IPC_EVENTS.GPS_NMEA)
    }
  },

  // -- Sesión --------------------------------------------------------------

  session: {
    start: (payload: {
      label?: string
      triggerMode?: 'distance' | 'time'
      minDistanceMeters?: number
      intervalMs?: number
    }): Promise<string> => ipcRenderer.invoke(IPC_HANDLERS.SESSION_START, payload),

    stop: (): Promise<SessionSummary> => ipcRenderer.invoke(IPC_HANDLERS.SESSION_STOP),

    onSample: (cb: (point: GeoTimestamp) => void) => {
      ipcRenderer.on(IPC_EVENTS.SESSION_SAMPLE, (_, point) => cb(point))
      return () => ipcRenderer.removeAllListeners(IPC_EVENTS.SESSION_SAMPLE)
    },

    onStarted: (cb: (data: { sessionId: string; startedAt: number; label: string }) => void) => {
      ipcRenderer.on(IPC_EVENTS.SESSION_STARTED, (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners(IPC_EVENTS.SESSION_STARTED)
    },

    onStopped: (cb: (data: SessionSummary) => void) => {
      ipcRenderer.on(IPC_EVENTS.SESSION_STOPPED, (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners(IPC_EVENTS.SESSION_STOPPED)
    }
  }
}

// -- contextBridge -----------------------------------------------------------------

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
