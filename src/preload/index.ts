import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { GeoTimestamp, GeoPosition } from '../shared/GeoTimestamp'
import type { DeviceManagerStateDTO } from '../shared/dto'
import type { DeviceStatus } from '../shared/device.types'
import type { SessionSummary } from '../shared/ipc.types'
import type { PersistedSession } from '../shared/services/ISessionRepository'
import { IPC_EVENTS, IPC_HANDLERS } from '../main/ipc/channels'

// -- API expuesta al Renderer via window.api ----------------------------
const api = {
  // -- Puertos y dispositivos -------------------------------------------

  ports: {
    list: (): Promise<{ path: string; manufacturer: string }[]> =>
      ipcRenderer.invoke(IPC_HANDLERS.PORTS_LIST)
  },

  devices: {
    list: (): Promise<DeviceManagerStateDTO> => ipcRenderer.invoke(IPC_HANDLERS.DEVICE_LIST),

    scan: (): Promise<DeviceManagerStateDTO> => ipcRenderer.invoke(IPC_HANDLERS.DEVICE_SCAN),

    setPort: (device: 'nbm550' | 'gps', port: string): Promise<DeviceManagerStateDTO> =>
      ipcRenderer.invoke(IPC_HANDLERS.DEVICE_SET_PORT, device, port),

    connect: (deviceId: 'nbm550' | 'gps'): Promise<void> =>
      ipcRenderer.invoke(IPC_HANDLERS.DEVICE_CONNECT, deviceId),

    disconnect: (deviceId: 'nbm550' | 'gps'): Promise<void> =>
      ipcRenderer.invoke(IPC_HANDLERS.DEVICE_DISCONNECT, deviceId),

    onStatus: (cb: (data: { deviceId: string; status: DeviceStatus }) => void) => {
      const handler = (_: IpcRendererEvent, data: { deviceId: string; status: DeviceStatus }) =>
        cb(data)
      ipcRenderer.on(IPC_EVENTS.DEVICE_STATUS, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.DEVICE_STATUS, handler)
    },

    onError: (cb: (data: { deviceId: string; error: string }) => void) => {
      const handler = (_: IpcRendererEvent, data: { deviceId: string; error: string }) => cb(data)
      ipcRenderer.on(IPC_EVENTS.DEVICE_ERROR, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.DEVICE_ERROR, handler)
    },

    onScanState: (cb: (state: DeviceManagerStateDTO) => void) => {
      const handler = (_: IpcRendererEvent, state: DeviceManagerStateDTO) => cb(state)
      ipcRenderer.on(IPC_EVENTS.SCAN_STATE, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.SCAN_STATE, handler)
    }
  },

  // -- GPS -----------------------------------------------------------------

  gps: {
    onPosition: (cb: (data: { coords: GeoPosition; valid: boolean }) => void) => {
      const handler = (_: IpcRendererEvent, data: { coords: GeoPosition; valid: boolean }) => {
        cb(data)
      }
      ipcRenderer.on(IPC_EVENTS.GPS_POSITION, handler)
      return () => {
        ipcRenderer.removeListener(IPC_EVENTS.GPS_POSITION, handler)
      }
    },

    onNmea: (cb: (data: { line: string; port: string }) => void) => {
      const handler = (_: IpcRendererEvent, data: { line: string; port: string }) => cb(data)
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
      const handler = (
        _: IpcRendererEvent,
        data: { rss: number; unit: string; battery: number; timestamp: number }
      ) => cb(data)
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
      testMode?: boolean
    }): Promise<string> => ipcRenderer.invoke(IPC_HANDLERS.SESSION_START, payload),

    stop: (): Promise<SessionSummary> => ipcRenderer.invoke(IPC_HANDLERS.SESSION_STOP),

    list: (): Promise<SessionSummary[]> => ipcRenderer.invoke(IPC_HANDLERS.SESSION_LIST_PERSISTED),

    get: (
      sessionId: string
    ): Promise<{ success: boolean; session?: PersistedSession | null; error?: string }> =>
      ipcRenderer.invoke(IPC_HANDLERS.SESSION_GET, sessionId),

    delete: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_HANDLERS.SESSION_DELETE, sessionId),

    exportGeoJSON: (
      sessionId: string
    ): Promise<{ success: boolean; data?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_HANDLERS.SESSION_EXPORT_GEOJSON, sessionId),

    exportCSV: (sessionId: string): Promise<{ success: boolean; data?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_HANDLERS.SESSION_EXPORT_CSV, sessionId),

    export: (
      sessionId: string,
      format: 'geojson' | 'xlsx' | 'kmz',
      label: string
    ): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_HANDLERS.SESSION_EXPORT, sessionId, format, label),

    getStats: (
      sessionId: string
    ): Promise<{
      success: boolean
      stats?: { avgRss: number; maxRss: number; minRss: number; pointCount: number } | null
      error?: string
    }> => ipcRenderer.invoke(IPC_HANDLERS.SESSION_STATS, sessionId),

    getPointsInBounds: (
      sessionId: string,
      north: number,
      south: number,
      east: number,
      west: number
    ): Promise<{ success: boolean; points?: GeoTimestamp[]; error?: string }> =>
      ipcRenderer.invoke(
        IPC_HANDLERS.SESSION_POINTS_IN_BOUNDS,
        sessionId,
        north,
        south,
        east,
        west
      ),

    onSample: (cb: (point: GeoTimestamp) => void) => {
      const handler = (_: IpcRendererEvent, point: GeoTimestamp) => cb(point)
      ipcRenderer.on(IPC_EVENTS.SESSION_SAMPLE, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.SESSION_SAMPLE, handler)
    },

    onStarted: (cb: (data: { sessionId: string; startedAt: number; label: string }) => void) => {
      const handler = (
        _: IpcRendererEvent,
        data: { sessionId: string; startedAt: number; label: string }
      ) => cb(data)
      ipcRenderer.on(IPC_EVENTS.SESSION_STARTED, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.SESSION_STARTED, handler)
    },

    onStopped: (cb: (data: SessionSummary) => void) => {
      const handler = (_: IpcRendererEvent, data: SessionSummary) => cb(data)
      ipcRenderer.on(IPC_EVENTS.SESSION_STOPPED, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.SESSION_STOPPED, handler)
    }
  },

  // -- Settings ---------------------------------------------------------------

  settings: {
    openUncertaintyFile: (): Promise<{
      success: boolean
      filePath?: string
      headers?: string[]
      records?: Array<{
        name: string
        fMin: number
        fMax: number
        uncertainty: number
        factor: number
      }>
      error?: string
      canceled?: boolean
    }> => ipcRenderer.invoke(IPC_HANDLERS.OPEN_UNCERTAINTY_FILE),

    getProbeInfo: (): Promise<{
      success: boolean
      probeInfo?: { model: string | null; serial: string | null; calibrationDate: string | null }
      error?: string
    }> => ipcRenderer.invoke(IPC_HANDLERS.GET_PROBE_INFO),

    getActiveUncertainty: (): Promise<{
      success: boolean
      factor: number | null
      matchedRecord: {
        name: string
        fMin: number
        fMax: number
        uncertainty: number
        factor: number
      } | null
      probeModel: string | null
    }> => ipcRenderer.invoke(IPC_HANDLERS.GET_ACTIVE_UNCERTAINTY),

    getLoadedUncertainty: (): Promise<{
      success: boolean
      filePath?: string
      headers?: string[]
      records?: Array<{
        name: string
        fMin: number
        fMax: number
        uncertainty: number
        factor: number
      }>
    }> => ipcRenderer.invoke(IPC_HANDLERS.GET_LOADED_UNCERTAINTY)
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
  // @ts-expect-error — fallback for non-isolated context
  window.api = api
}
