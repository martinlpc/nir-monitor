import { IPC_HANDLERS } from './channels'
import type { IpcMainLike } from './ipcEnv'
import { sanitizeReThrow } from './ipcEnv'
import type { DriverCheckResult, DriverType } from '../../shared/driver.types'

export interface DriverHandlerDeps {
  checkDrivers: () => Promise<DriverCheckResult>
  installDriver: (driverType: DriverType) => Promise<void>
}

export function registerDriverHandlers(ipc: IpcMainLike, deps: DriverHandlerDeps): void {
  ipc.handle(IPC_HANDLERS.DRIVERS_CHECK, async () => {
    try {
      return await deps.checkDrivers()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipc.handle(IPC_HANDLERS.DRIVERS_INSTALL, async (_event, driverType: DriverType) => {
    try {
      await deps.installDriver(driverType)
    } catch (err) {
      sanitizeReThrow(err)
    }
  })
}
