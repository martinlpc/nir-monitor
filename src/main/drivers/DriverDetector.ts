import { SerialPort } from 'serialport'
import { accessSync, constants } from 'fs'
import { join } from 'path'
import type { DriverType, PortDriverInfo, DriverCheckResult } from '../../shared/driver.types'

const VENDOR_MAP: Record<string, { type: DriverType; name: string }> = {
  '0403': { type: 'ftdi', name: 'FTDI' },
  '067B': { type: 'prolific', name: 'Prolific' },
  '1A86': { type: 'ch340', name: 'CH340' },
  '10C4': { type: 'cp210x', name: 'CP210x' }
}

const DRIVER_SYS_FILES: Record<DriverType, string[]> = {
  ftdi: ['ftdibus.sys', 'ftdiport.sys'],
  prolific: ['ser2pl.sys'],
  ch340: ['CH341SER.SYS'],
  cp210x: ['silabser.sys'],
  cdc_acm: [],
  unknown: []
}

function checkDriverInstalled(driverType: DriverType): boolean {
  const sysFiles = DRIVER_SYS_FILES[driverType]
  if (sysFiles.length === 0) return true

  const sysDir = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers')
  return sysFiles.some((file) => {
    try {
      accessSync(join(sysDir, file), constants.F_OK)
      return true
    } catch {
      return false
    }
  })
}

export class DriverDetector {
  async check(): Promise<DriverCheckResult> {
    const ports = await SerialPort.list()

    const resolved: PortDriverInfo[] = ports.map((p) => {
      const vid = p.vendorId ? p.vendorId.replace(/^0x/i, '').toLowerCase() : null
      const mapped = vid ? VENDOR_MAP[vid] : null
      const driverType: DriverType = mapped?.type ?? 'unknown'
      const installed = checkDriverInstalled(driverType)

      return {
        path: p.path,
        driverType,
        installed,
        friendlyName: p.friendlyName ?? p.path,
        manufacturer: p.manufacturer ?? null,
        vendorId: p.vendorId ?? null,
        productId: p.productId ?? null
      }
    })

    const missing = resolved.filter(
      (p) => !p.installed && p.driverType !== 'unknown' && p.driverType !== 'cdc_acm'
    )

    return { ports: resolved, missing }
  }
}
