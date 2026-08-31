import { NBM550Driver } from '../devices/nbm550/NBM550Driver'
import { GPSDriver } from '../devices/gps/GPSDriver'
import type { DriverFactory } from '../../shared/driver-factory'
import type { INBMDriver, IGPSDriver } from '../../shared/driver-interfaces'
import { DEFAULT_NBM_DRIVER, GPS_BAUD_RATE } from '../../shared/config.constants'

export class RealDriverFactory implements DriverFactory {
  createNBM(port: string): INBMDriver {
    const cfg = DEFAULT_NBM_DRIVER
    return new NBM550Driver({
      port,
      baudRate: cfg.baudRate,
      pollIntervalMs: cfg.pollIntervalMs,
      unit: cfg.unit as 'V/m'
    })
  }

  createGPS(port: string): IGPSDriver {
    return new GPSDriver({ port, baudRate: GPS_BAUD_RATE })
  }
}
