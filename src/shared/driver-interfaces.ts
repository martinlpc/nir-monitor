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
  getDeviceInfo(): {
    productName: string | null
    productionId: string | null
    serialNumber: string | null
    deviceId: string | null
    deviceType: string | null
    firmwareVersion: string | null
    calDate: string | null
    calDueDate: string | null
    noOfOptions: string | null
    optionsName: string | null
  } | null
  getMeterSerial(): string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): void
  removeAllListeners(event?: string): void
}
