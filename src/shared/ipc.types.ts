import type { GeoPosition, GeoTimestamp } from './GeoTimestamp'
import type { DeviceStatus } from './device.types'
import type { DeviceManagerStateDTO } from './dto'

// Canales Main → Renderer (push)
export interface IPCEvents {
  'device:status': { deviceId: string; status: DeviceStatus }
  'gps:position': { coords: GeoPosition; valid: boolean; port?: string }
  'session:sample': GeoTimestamp
  'session:started': { sessionId: string; startedAt: number; label: string }
  'session:stopped': SessionSummary
  'session:alert': { message: string }
}

// Canales Renderer → Main (request/response)
export interface IPCHandlers {
  'device:list': { request: void; response: DeviceManagerStateDTO }
  'device:connect': { request: { deviceId: string }; response: DeviceManagerStateDTO }
  'device:disconnect': { request: { deviceId: string }; response: DeviceManagerStateDTO }
  'session:start': {
    request: {
      label?: string
      triggerMode?: 'distance' | 'time'
      minDistanceMeters?: number
      intervalMs?: number
      testMode?: boolean
    }
    response: string
  } // devuelve sessionId
  'session:stop': { request: void; response: SessionSummary }
  'session:list': { request: void; response: SessionSummary | null }
  'export:geojson': { request: { sessionId: string }; response: string } // filepath
}

export interface InstrumentInfo {
  meter: {
    brand: string | null
    model: string | null
    serial: string | null
    lastCalibrationDate: string | null // ISO 8601
  }
  probe: {
    brand: string | null
    model: string | null
    serial: string | null
    calibrationDate: string | null
  }
}

// Obsoleto: Usar solo correctionFactor en SessionSummary
export interface UncertaintyRecord {
  name: string // modelo de la sonda (ej: "EF0391")
  fMin: number // frecuencia mínima (MHz)
  fMax: number // frecuencia máxima (MHz)
  uncertainty: number // (obsoleto, usar correctionFactor)
  factor: number // factor multiplicativo para aplicar al RSS
}

export interface UncertaintyData {
  filePath: string
  headers: string[]
  records: UncertaintyRecord[]
}

export interface SessionSummary {
  id: string
  label: string
  startedAt: number
  stoppedAt: number | null
  sampleCount: number
  instrument: InstrumentInfo | null
  correctionFactor: number | null // multiplicador aplicado a todas las mediciones (ej: 1.08)
}
