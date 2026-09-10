import { NBM550Driver } from '../devices/nbm550/NBM550Driver'
import { GPSDriver } from '../devices/gps/GPSDriver'
import { GarminUSBDriver } from '../devices/gps/garmin/GarminUSBDriver'
import { GARMIN_USB_PORT_PREFIX } from '../devices/gps/garmin/GarminUSBProtocol'
import type { DriverFactory } from '../../shared/driver-factory'
import type { INBMDriver, IGPSDriver } from '../../shared/driver-interfaces'
import { DEFAULT_NBM_DRIVER, GPS_BAUD_RATE, nbmBaudRateFor } from '../../shared/config.constants'
import type { NbmConnectionType } from '../../shared/config.types'

export class RealDriverFactory implements DriverFactory {
  createNBM(port: string, connectionType: NbmConnectionType = 'usb'): INBMDriver {
    const cfg = DEFAULT_NBM_DRIVER
    return new NBM550Driver({
      port,
      baudRate: nbmBaudRateFor(connectionType),
      pollIntervalMs: cfg.pollIntervalMs,
      unit: cfg.unit as 'V/m',
      connectionType
    })
  }

  createGPS(port: string): IGPSDriver {
    if (port.startsWith(GARMIN_USB_PORT_PREFIX)) {
      return new GarminUSBDriver({ port })
    }
    return new GPSDriver({ port, baudRate: GPS_BAUD_RATE })
  }
}
