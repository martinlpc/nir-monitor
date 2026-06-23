import { ipcMain } from 'electron'
import { IPC_HANDLERS } from './channels'
import { toUserError } from '../../shared/errors/toUserError'
import { DriverDetector } from '../drivers/DriverDetector'
import { DriverInstaller } from '../drivers/DriverInstaller'
import type { DriverType } from '../../shared/driver.types'

function sanitizeReThrow(err: unknown): never {
  const { message, technical } = toUserError(err)
  console.error(`[IPC] ${technical}`)
  throw new Error(message)
}

export function registerDriverHandlers(): void {
  const detector = new DriverDetector()
  const installer = new DriverInstaller()

  ipcMain.handle(IPC_HANDLERS.DRIVERS_CHECK, async () => {
    try {
      return await detector.check()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipcMain.handle(IPC_HANDLERS.DRIVERS_INSTALL, async (_event, driverType: DriverType) => {
    try {
      await installer.install(driverType)
    } catch (err) {
      sanitizeReThrow(err)
    }
  })
}
