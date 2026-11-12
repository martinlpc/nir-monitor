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

/**
 * Arma el comando de PowerShell que eleva pnputil para instalar un .inf.
 *
 * La lista de argumentos va entre comillas simples (literal de PowerShell) con
 * la ruta entre comillas dobles adentro, así pnputil recibe la ruta como un
 * solo argumento aunque tenga espacios (`C:\Program Files\RNI Monitor\...`).
 */
export function buildPnputilCommand(infPath: string): string {
  // En un literal de comillas simples solo hay que duplicar la comilla simple.
  // Una comilla doble no puede aparecer en una ruta de Windows.
  const argumentList = `/add-driver "${infPath}" /install`.replace(/'/g, "''")
  return `Start-Process -FilePath pnputil.exe -ArgumentList '${argumentList}' -Verb RunAs -Wait -WindowStyle Hidden`
}

/**
 * Codifica el comando para `-EncodedCommand` (base64 de UTF-16LE). Evita que
 * las comillas pasen por el parseo de la línea de comandos de Windows.
 */
export function encodePowerShellCommand(command: string): string {
  return Buffer.from(command, 'utf16le').toString('base64')
}

type ExecFileLike = (
  file: string,
  args: string[],
  options: { windowsHide: boolean; timeout: number },
  callback: (error: Error | null) => void
) => unknown

export class DriverInstaller {
  constructor(
    private readonly exec: ExecFileLike = execFile as unknown as ExecFileLike,
    private readonly getResourcesPath: () => string = () => process.resourcesPath
  ) {}

  async install(driverType: DriverType): Promise<void> {
    // El tipo llega desde el renderer: solo se aceptan las claves propias de la tabla
    const infFiles = Object.hasOwn(DRIVER_INF_FILES, driverType)
      ? DRIVER_INF_FILES[driverType]
      : null
    if (!infFiles) {
      throw new Error(`No bundled installer for driver type: ${driverType}`)
    }

    const driverDir = join(this.getResourcesPath(), 'drivers', driverType)

    for (const inf of infFiles) {
      const infPath = join(driverDir, inf)
      await this.runPnputil(infPath)
    }
  }

  private runPnputil(infPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.exec(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          encodePowerShellCommand(buildPnputilCommand(infPath))
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
