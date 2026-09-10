import * as usb from 'usb'
import { GARMIN_PID, GARMIN_VID } from './GarminUSBProtocol'

export interface GarminUsbStatus {
  present: boolean
  accessible: boolean
}

export function detectGarminUsb(): GarminUsbStatus {
  try {
    const device = usb.findByIds(GARMIN_VID, GARMIN_PID)
    if (!device) return { present: false, accessible: false }
    try {
      device.open()
      const iface = device.interface(0)
      iface.claim()
      iface.release(true)
      device.close()
      return { present: true, accessible: true }
    } catch {
      closeSafely(device)
      return { present: true, accessible: false }
    }
  } catch {
    return { present: false, accessible: false }
  }
}

function closeSafely(device: usb.Device): void {
  try {
    device.close()
  } catch {
    // ignored, device may never have been opened
  }
}
