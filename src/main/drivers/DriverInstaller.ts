import { execFile } from 'child_process'
import { join } from 'path'
import type { DriverType } from '../../shared/driver.types'

const DRIVER_INF_FILES: Record<DriverType, string[] | null> = {
  ftdi: ['ftdibus.inf', 'ftdiport.inf'],
  prolific: ['ser2pl.inf'],
  ch340: null,
  cp210x: null,
  cdc_acm: null,
  unknown: null
}

export class DriverInstaller {
  async install(driverType: DriverType): Promise<void> {
    const infFiles = DRIVER_INF_FILES[driverType]
    if (!infFiles) {
      throw new Error(`No bundled installer for driver type: ${driverType}`)
    }

    const resourcesPath = process.resourcesPath
    const driverDir = join(resourcesPath, 'drivers', driverType)

    for (const inf of infFiles) {
      const infPath = join(driverDir, inf)
      await this.runPnputil(infPath)
    }
  }

  private runPnputil(infPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        [
          '-Command',
          'Start-Process',
          '-FilePath',
          'pnputil.exe',
          '-ArgumentList',
          `"/add-driver "${infPath}" /install"`,
          '-Verb',
          'RunAs',
          '-Wait',
          '-WindowStyle',
          'Hidden'
        ],
        { windowsHide: true, timeout: 120000 },
        (error) => {
          if (error) {
            reject(new Error(`pnputil failed: ${error.message}`))
          } else {
            resolve()
          }
        }
      )
    })
  }
}
