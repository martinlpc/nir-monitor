import { SimulatedNBM550Driver } from '../devices/simulated/SimulatedNBM550Driver'
import { SimulatedGPSDriver } from '../devices/simulated/SimulatedGPSDriver'
import type { DriverFactory } from '../../shared/driver-factory'
import type { INBMDriver, IGPSDriver } from '../../shared/driver-interfaces'

export class SimulatedDriverFactory implements DriverFactory {
  createNBM(port: string): INBMDriver {
    return new SimulatedNBM550Driver({ port })
  }

  createGPS(port: string): IGPSDriver {
    return new SimulatedGPSDriver({ port })
  }
}
