import * as usb from 'usb'
import { GARMIN_PID, GARMIN_VID } from './GarminUSBProtocol'

export interface GarminUsbStatus {
  present: boolean
  accessible: boolean
}

const RELEASE_TIMEOUT_MS = 1000

export async function detectGarminUsb(): Promise<GarminUsbStatus> {
  try {
    const device = usb.findByIds(GARMIN_VID, GARMIN_PID)
    if (!device) return { present: false, accessible: false }
    try {
      device.open()
      const iface = device.interface(0)
      iface.claim()
      await releaseInterface(iface)
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

function releaseInterface(iface: usb.Interface): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      resolve()
    }
    try {
      iface.release(true, () => finish())
      setTimeout(finish, RELEASE_TIMEOUT_MS)
    } catch {
      finish()
    }
  })
}

function closeSafely(device: usb.Device): void {
  try {
    device.close()
  } catch {
    // ignored, device may never have been opened
  }
}
