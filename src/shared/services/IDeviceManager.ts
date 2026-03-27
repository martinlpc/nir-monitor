// Interface pura - contrato de DeviceManager
import type { DeviceStatus } from '../dto/index'

export interface IDeviceManager {
  // State
  getState(): {
    nbm550: { port: string | null; status: DeviceStatus }
    gps: { port: string | null; status: DeviceStatus }
    scanning: boolean
  }

  // Accesors para SessionService
  getNBM(): any // Retorna NBM550Driver
  getGPS(): any // Retorna GPSDriver

  // Ciclo de vida
  initialize(): Promise<void>
  scan(): Promise<any>
  setPortManual(device: 'nbm550' | 'gps', port: string): Promise<void>
  disconnectAll(): Promise<void>

  // Cleanup
  stopNBMPolling(): void

  // Para testing/mocking
  isConnected(device: 'nbm550' | 'gps'): boolean

  // Events (EventEmitter interface)
  on(event: string, listener: (...args: unknown[]) => void): this
  removeAllListeners(event?: string): this
}
