import type { GeoTimestamp, GeoPosition } from '../shared/GeoTimestamp'
import type { DeviceManagerStateDTO } from '../shared/dto'
import type { SessionSummary } from '../shared/ipc.types'
import type { PersistedSession } from '../shared/services/ISessionRepository'
import type { DeviceStatus } from '../shared/device.types'

declare global {
  interface Window {
    api: {
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
        onPosition: (cb: (data: { coords: GeoPosition; valid: boolean }) => void) => () => void
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
        ) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>
        getStats: (sessionId: string) => Promise<{
          success: boolean
          stats?: { avgRss: number; maxRss: number; minRss: number; pointCount: number } | null
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
          cb: (data: { sessionId: string; startedAt: number; label: string }) => void
        ) => () => void
        onStopped: (cb: (data: SessionSummary) => void) => () => void
      }
    }
  }
}
