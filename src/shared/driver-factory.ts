import type { INBMDriver, IGPSDriver } from './driver-interfaces'
import type { NbmConnectionType } from './config.types'

export interface DriverFactory {
  createNBM(port: string, connectionType?: NbmConnectionType): INBMDriver
  createGPS(port: string): IGPSDriver
}
