import { ipcMain } from 'electron'
import { IPC_HANDLERS } from './channels'
import { DriverDetector } from '../drivers/DriverDetector'
import { DriverInstaller } from '../drivers/DriverInstaller'
import type { DriverType } from '../../shared/driver.types'

export function registerDriverHandlers(): void {
  const detector = new DriverDetector()
  const installer = new DriverInstaller()

  ipcMain.handle(IPC_HANDLERS.DRIVERS_CHECK, async () => {
    return await detector.check()
  })

  ipcMain.handle(IPC_HANDLERS.DRIVERS_INSTALL, async (_event, driverType: DriverType) => {
    await installer.install(driverType)
  })
}
