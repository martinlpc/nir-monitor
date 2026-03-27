import type { GeoTimestamp, GeoPosition } from '../shared/GeoTimestamp'
import type { DeviceManagerState } from '../main/services/DeviceManager'
import type { SessionSummary } from '../shared/ipc.types'

declare global {
  interface Window {
    api: {
      ports: {
        list: () => Promise<{ path: string; manufacturer: string }[]>
      }
      devices: {
        list: () => Promise<DeviceManagerState>
        scan: () => Promise<DeviceManagerState>
        setPort: (device: 'nbm550' | 'gps', port: string) => Promise<DeviceManagerState>
        connect: (deviceId: 'nbm550' | 'gps') => Promise<void>
        disconnect: (deviceId: 'nbm550' | 'gps') => Promise<void>
        onStatus: (cb: (data: { deviceId: string; status: string }) => void) => () => void
        onError: (cb: (data: { deviceId: string; error: string }) => void) => () => void
        onScanState: (cb: (state: DeviceManagerState) => void) => () => void
      }
      gps: {
        onPosition: (cb: (data: { coords: GeoPosition; valid: boolean }) => void) => () => void
        onNmea: (cb: (data: { line: string; port: string }) => void) => () => void
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
        }) => Promise<string>
        stop: () => Promise<SessionSummary>
        onSample: (cb: (point: GeoTimestamp) => void) => () => void
        onStarted: (
          cb: (data: { sessionId: string; startedAt: number; label: string }) => void
        ) => () => void
        onStopped: (cb: (data: SessionSummary) => void) => () => void
      }
    }
  }
}
