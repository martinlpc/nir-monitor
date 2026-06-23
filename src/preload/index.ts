import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { GeoTimestamp, GeoPosition } from '../shared/GeoTimestamp'
import type { DeviceManagerStateDTO } from '../shared/dto'
import type { DeviceStatus } from '../shared/device.types'
import type { SessionSummary, InstrumentInfo } from '../shared/ipc.types'
import type { PersistedSession } from '../shared/services/ISessionRepository'
import { IPC_EVENTS, IPC_HANDLERS } from '../main/ipc/channels'
import type { CacheStats, PreloadProgress } from '../main/tile-cache/TileCacheService'
import type { DriverCheckResult, DriverType } from '../shared/driver.types'
import type { AppErrorInfo } from '../shared/errors/error.types'

const api = {
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    if (channel === 'alert') {
      const handler = (_: IpcRendererEvent, payload: { message: string; type: string }): void =>
        cb(_, payload)
      ipcRenderer.on('alert', handler)
      return () => ipcRenderer.removeListener('alert', handler)
    }
    return () => {}
  },
  off: (channel: string, cb: (...args: unknown[]) => void) => {
    if (channel === 'alert') {
      ipcRenderer.removeListener('alert', cb)
    }
  },

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
      const handler = (
        _: IpcRendererEvent,
        data: { deviceId: string; status: DeviceStatus }
      ): void => cb(data)
      ipcRenderer.on(IPC_EVENTS.DEVICE_STATUS, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.DEVICE_STATUS, handler)
    },

    onError: (cb: (data: { deviceId: string; error: AppErrorInfo }) => void) => {
      const handler = (
        _: IpcRendererEvent,
        data: { deviceId: string; error: AppErrorInfo }
      ): void => cb(data)
      ipcRenderer.on(IPC_EVENTS.DEVICE_ERROR, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.DEVICE_ERROR, handler)
    },

    onScanState: (cb: (state: DeviceManagerStateDTO) => void) => {
      const handler = (_: IpcRendererEvent, state: DeviceManagerStateDTO): void => cb(state)
      ipcRenderer.on(IPC_EVENTS.SCAN_STATE, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.SCAN_STATE, handler)
    }
  },

  gps: {
    onPosition: (cb: (data: { coords: GeoPosition; valid: boolean; port?: string }) => void) => {
      const handler = (
        _: IpcRendererEvent,
        data: { coords: GeoPosition; valid: boolean; port?: string }
      ): void => {
        cb(data)
      }
      ipcRenderer.on(IPC_EVENTS.GPS_POSITION, handler)
      return () => {
        ipcRenderer.removeListener(IPC_EVENTS.GPS_POSITION, handler)
      }
    },

    onNmea: (cb: (data: { line: string; port: string }) => void) => {
      const handler = (_: IpcRendererEvent, data: { line: string; port: string }): void => cb(data)
      ipcRenderer.on(IPC_EVENTS.GPS_NMEA, handler)
      return () => {
        ipcRenderer.removeListener(IPC_EVENTS.GPS_NMEA, handler)
      }
    },

    onFixLost: (cb: () => void) => {
      const handler = (): void => cb()
      ipcRenderer.on(IPC_EVENTS.GPS_FIX_LOST, handler)
      return () => {
        ipcRenderer.removeListener(IPC_EVENTS.GPS_FIX_LOST, handler)
      }
    }
  },

  nbm: {
    onSample: (
      cb: (data: { rss: number; unit: string; battery: number; timestamp: number }) => void
    ) => {
      const handler = (
        _: IpcRendererEvent,
        data: { rss: number; unit: string; battery: number; timestamp: number }
      ): void => cb(data)
      ipcRenderer.on(IPC_EVENTS.NBM_SAMPLE, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.NBM_SAMPLE, handler)
    },

    onBattery: (cb: (battery: number) => void) => {
      const handler = (_: IpcRendererEvent, battery: number): void => cb(battery)
      ipcRenderer.on(IPC_EVENTS.NBM_BATTERY, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.NBM_BATTERY, handler)
    },

    onMode: (cb: (mode: 'active' | 'standby') => void) => {
      const handler = (_: IpcRendererEvent, mode: 'active' | 'standby'): void => cb(mode)
      ipcRenderer.on(IPC_EVENTS.NBM_MODE, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.NBM_MODE, handler)
    }
  },

  session: {
    start: (payload: {
      label?: string
      triggerMode?: 'distance' | 'time'
      minDistanceMeters?: number
      intervalMs?: number
      testMode?: boolean
      provincia?: string
      localidad?: string
      apellido1?: string
      apellido2?: string
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
    ): Promise<{ success: boolean; data?: string; error?: string; truncated?: boolean }> =>
      ipcRenderer.invoke(IPC_HANDLERS.SESSION_EXPORT_GEOJSON, sessionId),

    exportCSV: (
      sessionId: string
    ): Promise<{ success: boolean; data?: string; error?: string; truncated?: boolean }> =>
      ipcRenderer.invoke(IPC_HANDLERS.SESSION_EXPORT_CSV, sessionId),

    export: (
      sessionId: string,
      format: 'geojson' | 'xlsx' | 'kmz',
      label: string
    ): Promise<{
      success: boolean
      filePaths?: string[]
      canceled?: boolean
      error?: string
      truncated?: boolean
    }> => ipcRenderer.invoke(IPC_HANDLERS.SESSION_EXPORT, sessionId, format, label),

    importGeoJSON: (): Promise<{
      success: boolean
      sessionId?: string
      canceled?: boolean
      error?: string
    }> => ipcRenderer.invoke(IPC_HANDLERS.SESSION_IMPORT_GEOJSON),

    getStats: (
      sessionId: string
    ): Promise<{
      success: boolean
      stats?: {
        avgCorrected: number
        maxCorrected: number
        minCorrected: number
        pointCount: number
      } | null
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
      const handler = (_: IpcRendererEvent, point: GeoTimestamp): void => cb(point)
      ipcRenderer.on(IPC_EVENTS.SESSION_SAMPLE, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.SESSION_SAMPLE, handler)
    },

    onStarted: (
      cb: (data: {
        sessionId: string
        startedAt: number
        label: string
        correctionFactor: number | null
        instrument: InstrumentInfo | null
      }) => void
    ) => {
      const handler = (
        _: IpcRendererEvent,
        data: {
          sessionId: string
          startedAt: number
          label: string
          correctionFactor: number | null
          instrument: InstrumentInfo | null
        }
      ): void => cb(data)
      ipcRenderer.on(IPC_EVENTS.SESSION_STARTED, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.SESSION_STARTED, handler)
    },

    onStopped: (cb: (data: SessionSummary) => void) => {
      const handler = (_: IpcRendererEvent, data: SessionSummary): void => cb(data)
      ipcRenderer.on(IPC_EVENTS.SESSION_STOPPED, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.SESSION_STOPPED, handler)
    },

    onAlert: (cb: (data: { message: string }) => void) => {
      const handler = (_: IpcRendererEvent, data: { message: string }): void => cb(data)
      ipcRenderer.on(IPC_EVENTS.SESSION_ALERT, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.SESSION_ALERT, handler)
    }
  },

  settings: {
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

    getBuiltInProbeData: (): Promise<{
      success: boolean
      version: number | null
      records: Array<{
        name: string
        fMin: number
        fMax: number
        uncertainty: number
        factor: number
      }>
    }> => ipcRenderer.invoke(IPC_HANDLERS.GET_BUILT_IN_PROBE_DATA)
  },

  tileCache: {
    getStats: (): Promise<CacheStats> => ipcRenderer.invoke(IPC_HANDLERS.TILE_CACHE_STATS),

    clearCache: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_HANDLERS.TILE_CLEAR_CACHE),

    preloadTiles: (options: {
      providerId: string
      north: number
      south: number
      east: number
      west: number
      minZoom: number
      maxZoom: number
    }): Promise<{ success: boolean }> => ipcRenderer.invoke(IPC_HANDLERS.TILE_PRELOAD, options),

    cancelPreload: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_HANDLERS.TILE_PRELOAD_CANCEL),

    importTiles: (options: {
      providerId: string
    }): Promise<{
      success: boolean
      imported?: number
      skipped?: number
      canceled?: boolean
    }> => ipcRenderer.invoke(IPC_HANDLERS.TILE_IMPORT, options),

    onPreloadProgress: (cb: (progress: PreloadProgress) => void) => {
      const handler = (_: IpcRendererEvent, progress: PreloadProgress): void => cb(progress)
      ipcRenderer.on(IPC_EVENTS.TILE_PRELOAD_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.TILE_PRELOAD_PROGRESS, handler)
    },

    onImportProgress: (
      cb: (progress: { imported: number; skipped: number; total: number }) => void
    ) => {
      const handler = (
        _: IpcRendererEvent,
        progress: { imported: number; skipped: number; total: number }
      ): void => cb(progress)
      ipcRenderer.on(IPC_EVENTS.TILE_IMPORT_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC_EVENTS.TILE_IMPORT_PROGRESS, handler)
    }
  },

  drivers: {
    check: (): Promise<DriverCheckResult> => ipcRenderer.invoke(IPC_HANDLERS.DRIVERS_CHECK),

    install: (type: DriverType): Promise<void> =>
      ipcRenderer.invoke(IPC_HANDLERS.DRIVERS_INSTALL, type)
  },

  app: {
    getVersion: (): Promise<{ version: string }> => ipcRenderer.invoke(IPC_HANDLERS.GET_APP_VERSION)
  },

  logs: {
    getPath: (): Promise<{ success: boolean; path: string }> =>
      ipcRenderer.invoke(IPC_HANDLERS.LOGS_GET_PATH),

    export: (): Promise<{ success: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_HANDLERS.LOGS_EXPORT)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error -- window.api is set in non-contextIsolated fallback
  window.api = api
}
