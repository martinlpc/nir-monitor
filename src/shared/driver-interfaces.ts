import type { GeoPosition } from './GeoTimestamp'
import type { DeviceStatus } from './device.types'

export interface INBMDriver {
  meta: { id: string; port: string; name: string; type: string; baudRate: number }
  status: DeviceStatus
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  readMeasurement(): Promise<{
    rss: number
    unit: string
    battery: number
    timestamp: number
  } | null>
  readBattery(): Promise<number | null>
  resetMaxHold(): Promise<void>
  getProbeInfo(): {
    model: string | null
    serial: string | null
    calibrationDate: string | null
  } | null
  getMeterSerial(): string | null
  on(event: string, listener: (...args: any[]) => void): void
  removeAllListeners(event?: string): void
}

export interface IGPSDriver {
  meta: { id: string; port: string; name: string; type: string; baudRate: number }
  status: DeviceStatus
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  getLastPosition(): GeoPosition | null
  isPositionValid(): boolean
  on(event: string, listener: (...args: any[]) => void): void
  removeAllListeners(event?: string): void
}
