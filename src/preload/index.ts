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
      const handler = (_: any, data: any) => cb(data)
      ipcRenderer.on(IPC_EVENTS.DEVICE_STATUS, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.DEVICE_STATUS, handler)
    },

    onError: (cb: (data: { deviceId: string; error: string }) => void) => {
      const handler = (_: any, data: any) => cb(data)
      ipcRenderer.on(IPC_EVENTS.DEVICE_ERROR, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.DEVICE_ERROR, handler)
    },

    onScanState: (cb: (state: DeviceManagerState) => void) => {
      const handler = (_: any, state: any) => cb(state)
      ipcRenderer.on(IPC_EVENTS.SCAN_STATE, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.SCAN_STATE, handler)
    }
  },

  // -- GPS -----------------------------------------------------------------

  gps: {
    onPosition: (cb: (data: { coords: GeoPosition; valid: boolean }) => void) => {
      const handler = (_: any, data: any) => {
        cb(data)
      }
      ipcRenderer.on(IPC_EVENTS.GPS_POSITION, handler)
      return () => {
        ipcRenderer.removeListener(IPC_EVENTS.GPS_POSITION, handler)
      }
    },

    onNmea: (cb: (data: { line: string; port: string }) => void) => {
      const handler = (_: any, data: any) => cb(data)
      ipcRenderer.on(IPC_EVENTS.GPS_NMEA, handler)
      return () => {
        ipcRenderer.removeListener(IPC_EVENTS.GPS_NMEA, handler)
      }
    },

    onFixLost: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on(IPC_EVENTS.GPS_FIX_LOST, handler)
      return () => {
        ipcRenderer.removeListener(IPC_EVENTS.GPS_FIX_LOST, handler)
      }
    }
  },

  // -- NBM550 ---------------------------------------------------------------

  nbm: {
    onSample: (
      cb: (data: { rss: number; unit: string; battery: number; timestamp: number }) => void
    ) => {
      const handler = (_: any, data: any) => cb(data)
      ipcRenderer.on(IPC_EVENTS.NBM_SAMPLE, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.NBM_SAMPLE, handler)
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
      const handler = (_: any, point: any) => cb(point)
      ipcRenderer.on(IPC_EVENTS.SESSION_SAMPLE, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.SESSION_SAMPLE, handler)
    },

    onStarted: (cb: (data: { sessionId: string; startedAt: number; label: string }) => void) => {
      const handler = (_: any, data: any) => cb(data)
      ipcRenderer.on(IPC_EVENTS.SESSION_STARTED, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.SESSION_STARTED, handler)
    },

    onStopped: (cb: (data: SessionSummary) => void) => {
      const handler = (_: any, data: any) => cb(data)
      ipcRenderer.on(IPC_EVENTS.SESSION_STOPPED, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.SESSION_STOPPED, handler)
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
