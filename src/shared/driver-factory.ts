import type { INBMDriver, IGPSDriver } from './driver-interfaces'

export interface DriverFactory {
  createNBM(port: string): INBMDriver
  createGPS(port: string): IGPSDriver
}
