import type { GeoTimestamp, GeoPosition } from '../shared/GeoTimestamp'
import type { DeviceManagerStateDTO } from '../shared/dto'
import type { SessionSummary, InstrumentInfo } from '../shared/ipc.types'
import type { PersistedSession } from '../shared/services/ISessionRepository'
import type { DeviceStatus } from '../shared/device.types'

declare global {
  interface Window {
    api: {
      on: (
        channel: 'alert',
        cb: (event: unknown, payload: { message: string; type: string }) => void
      ) => () => void
      off: (
        channel: 'alert',
        cb: (event: unknown, payload: { message: string; type: string }) => void
      ) => void
      ports: {
        list: () => Promise<{ path: string; manufacturer: string }[]>
      }
      devices: {
        list: () => Promise<DeviceManagerStateDTO>
        scan: () => Promise<DeviceManagerStateDTO>
        setPort: (device: 'nbm550' | 'gps', port: string) => Promise<DeviceManagerStateDTO>
        connect: (deviceId: 'nbm550' | 'gps') => Promise<void>
        disconnect: (deviceId: 'nbm550' | 'gps') => Promise<void>
        onStatus: (cb: (data: { deviceId: string; status: DeviceStatus }) => void) => () => void
        onError: (cb: (data: { deviceId: string; error: string }) => void) => () => void
        onScanState: (cb: (state: DeviceManagerStateDTO) => void) => () => void
      }
      gps: {
        onPosition: (
          cb: (data: { coords: GeoPosition; valid: boolean; port?: string }) => void
        ) => () => void
        onNmea: (cb: (data: { line: string; port: string }) => void) => () => void
        onFixLost: (cb: () => void) => () => void
      }
      nbm: {
        onSample: (
          cb: (data: { rss: number; unit: string; battery: number; timestamp: number }) => void
        ) => () => void
      }
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
        }) => Promise<string>
        stop: () => Promise<SessionSummary>
        list: () => Promise<SessionSummary[]>
        get: (
          sessionId: string
        ) => Promise<{ success: boolean; session?: PersistedSession | null; error?: string }>
        delete: (sessionId: string) => Promise<{ success: boolean; error?: string }>
        exportGeoJSON: (
          sessionId: string
        ) => Promise<{ success: boolean; data?: string; error?: string }>
        exportCSV: (
          sessionId: string
        ) => Promise<{ success: boolean; data?: string; error?: string }>
        export: (
          sessionId: string,
          format: 'geojson' | 'xlsx' | 'kmz',
          label: string
        ) => Promise<{
          success: boolean
          filePaths?: string[]
          canceled?: boolean
          error?: string
        }>
        importGeoJSON: () => Promise<{
          success: boolean
          sessionId?: string
          canceled?: boolean
          error?: string
        }>
        getStats: (sessionId: string) => Promise<{
          success: boolean
          stats?: {
            avgCorrected: number
            maxCorrected: number
            minCorrected: number
            pointCount: number
          } | null
          error?: string
        }>
        getPointsInBounds: (
          sessionId: string,
          north: number,
          south: number,
          east: number,
          west: number
        ) => Promise<{ success: boolean; points?: GeoTimestamp[]; error?: string }>
        onSample: (cb: (point: GeoTimestamp) => void) => () => void
        onStarted: (
          cb: (data: {
            sessionId: string
            startedAt: number
            label: string
            correctionFactor: number | null
            instrument: InstrumentInfo | null
          }) => void
        ) => () => void
        onStopped: (cb: (data: SessionSummary) => void) => () => void
        onAlert: (cb: (data: { message: string }) => void) => () => void
      }
      settings: {
        getProbeInfo: () => Promise<{
          success: boolean
          probeInfo?: {
            model: string | null
            serial: string | null
            calibrationDate: string | null
          }
          error?: string
        }>
        getActiveUncertainty: () => Promise<{
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
        }>
        getBuiltInProbeData: () => Promise<{
          success: boolean
          version: number | null
          records: Array<{
            name: string
            fMin: number
            fMax: number
            uncertainty: number
            factor: number
          }>
        }>
      }
      tileCache: {
        getStats: () => Promise<{
          sizeBytes: number
          tileCount: number
        }>
        clearCache: () => Promise<{ success: boolean }>
        preloadTiles: (options: {
          providerId: string
          north: number
          south: number
          east: number
          west: number
          minZoom: number
          maxZoom: number
        }) => Promise<{ success: boolean }>
        cancelPreload: () => Promise<{ success: boolean }>
        importTiles: (options: { providerId: string }) => Promise<{
          success: boolean
          imported?: number
          skipped?: number
          canceled?: boolean
        }>
        onPreloadProgress: (
          cb: (progress: {
            current: number
            total: number
            zoom: number
            phase: 'counting' | 'downloading' | 'done' | 'cancelled' | 'error'
            error?: string
          }) => void
        ) => () => void
        onImportProgress: (
          cb: (progress: { imported: number; skipped: number; total: number }) => void
        ) => () => void
      }
    }
  }
}
