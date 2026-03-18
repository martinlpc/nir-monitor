export type DeviceType = 'emf' | 'gps'
export type DeviceStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface DeviceMeta {
  id: string // 'nbm500', 'gps-primary', etc.
  name: string // display name
  type: DeviceType
  port: string // 'COM3', '/dev/ttyUSB0'
  baudRate: number
}

export interface IDeviceDriver {
  readonly meta: DeviceMeta
  status: DeviceStatus

  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean

  // El driver emite eventos — el DeviceManager los escucha
  on(event: 'sample', listener: (sample: unknown) => void): void
  on(event: 'status', listener: (status: DeviceStatus) => void): void
  on(event: 'error', listener: (err: Error) => void): void
  off(event: string, listener: (...args: unknown[]) => void): void
}
