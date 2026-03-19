import type { GeoPosition, GeoTimestamp } from './GeoTimestamp'
import type { DeviceMeta, DeviceStatus } from './device.types'

// Canales Main → Renderer (push)
export interface IPCEvents {
  'device:status': { deviceId: string; status: DeviceStatus }
  'gps:position': { coords: GeoPosition; valid: boolean }
  'session:sample': GeoTimestamp
  'session:started': { sessionId: string; startedAt: number }
  'session:stopped': { sessionId: string; duration: number }
}

// Canales Renderer → Main (request/response)
export interface IPCHandlers {
  'device:list': { request: void; response: DeviceMeta[] }
  'device:connect': { request: { deviceId: string }; response: void }
  'device:disconnect': { request: { deviceId: string }; response: void }
  'session:start': { request: { label?: string }; response: string } // devuelve sessionId
  'session:stop': { request: void; response: void }
  'session:list': { request: void; response: SessionSummary[] }
  'export:geojson': { request: { sessionId: string }; response: string } // filepath
}

export interface SessionSummary {
  id: string
  label: string
  startedAt: number
  stoppedAt: number | null
  sampleCount: number
}
