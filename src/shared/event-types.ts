import type { DeviceStatus } from './device.types'
import type { GeoPosition, GeoTimestamp } from './GeoTimestamp'
import type { SessionSummary, InstrumentInfo } from './ipc.types'
import type { AppErrorInfo } from './errors/error.types'
import type { DeviceManagerState } from '../main/services/DeviceManager'

// -- GPSDriver / SimulatedGPSDriver --------------------------------
export interface GPSDriverEvents {
  status: DeviceStatus
  position: { coords: GeoPosition | null; valid: boolean }
  nmea: string
  'fix-lost': void
  error: Error
}

// -- NBM550Driver / SimulatedNBM550Driver ---------------------------
export interface NBM550DriverEvents {
  status: DeviceStatus
  error: Error
}

// -- DeviceManager --------------------------------------------------
export interface DeviceManagerEvents {
  'device:status': { deviceId: string; status: DeviceStatus; intentional?: boolean }
  'device:error': { deviceId: string; error: AppErrorInfo }
  'nbm:sample': { rss: number; unit: string; battery: number; timestamp: number }
  'nbm:battery': number
  'nbm:mode': 'active' | 'standby'
  'gps:nmea': { line: string; port: string }
  'gps:position': { coords: GeoPosition | null; valid: boolean; port: string }
  'gps:fix-lost': void
  state: DeviceManagerState
  scanning: boolean
}

// ── SessionService ──────────────────────────────────────
export interface SessionServiceEvents {
  point: GeoTimestamp
  started: {
    sessionId: string
    startedAt: number
    label: string
    correctionFactor: number | null
    instrument: InstrumentInfo | null
  }
  stopped: SessionSummary
  alert: { message: string }
  position: { coords: GeoPosition; valid: boolean }
  'session:saveError': { sessionId: string; error: unknown }
}

// ── GeoFusionService ────────────────────────────────────
export interface GeoFusionServiceEvents {
  point: GeoTimestamp
}

// ── TileCacheService ────────────────────────────────────
import type { PreloadProgress } from './tile.types'
export interface TileCacheServiceEvents {
  'preload-progress': PreloadProgress
}
