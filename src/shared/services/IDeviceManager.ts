// Interface pura - contrato de DeviceManager
import type { DeviceStatus, DeviceManagerStateDTO } from '../dto/index'
import type { IDeviceDriver } from '../device.types'

export interface IDeviceManager {
  // State
  getState(): {
    nbm550: { port: string | null; status: DeviceStatus }
    gps: { port: string | null; status: DeviceStatus }
    scanning: boolean
  }

  // Accesors para SessionService
  getNBM(): IDeviceDriver | null
  getGPS(): IDeviceDriver | null

  // Ciclo de vida
  initialize(): Promise<void>
  scan(): Promise<DeviceManagerStateDTO>
  setPortManual(device: 'nbm550' | 'gps', port: string): Promise<void>
  disconnectDevice(device: 'nbm550' | 'gps'): Promise<void>
  disconnectAll(): Promise<void>

  // Cleanup
  stopNBMPolling(): void

  // Para testing/mocking
  isConnected(device: 'nbm550' | 'gps'): boolean

  // Events (EventEmitter interface)
  on(event: string, listener: (...args: unknown[]) => void): this
  removeAllListeners(event?: string): this
}
