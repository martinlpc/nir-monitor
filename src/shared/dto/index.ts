// DTOs para comunicación IPC - Desacoplados de implementaciones internas
export type DeviceStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface DeviceDTO {
  id: string
  name: string
  type: 'nbm550' | 'gps'
  port: string
  baudRate: number
  status: DeviceStatus
}

export interface DeviceManagerStateDTO {
  nbm550: {
    port: string | null
    status: DeviceStatus
  }
  gps: {
    port: string | null
    status: DeviceStatus
  }
  scanning: boolean
}

export interface GeoPointDTO {
  id: string
  timestamp: number
  latitude: number
  longitude: number
  altitude?: number
  emfValue: number
  emfUnit: string
  accuracy?: number
}

export interface SessionStateDTO {
  sessionId: string | null
  state: 'idle' | 'running' | 'stopped'
  label: string
  pointCount: number
  startedAt: number | null
}

export interface ProbedDeviceInfo {
  port: string
  type: 'nbm550' | 'gps' | 'unknown'
  metadata?: Record<string, unknown>
}
