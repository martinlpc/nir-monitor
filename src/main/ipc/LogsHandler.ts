import { join } from 'path'
import { IPC_HANDLERS } from '../../shared/ipc-channels'
import type { IpcMainLike } from './ipcEnv'
import { sanitizeReThrow } from './ipcEnv'

export interface LogsHandlerDeps {
  logPath: string
  readLog: () => string
  getDesktopPath: () => string
  writeFile: (path: string, content: string) => void
  now: () => number
}

export function registerLogsHandlers(ipc: IpcMainLike, deps: LogsHandlerDeps): void {
  ipc.handle(IPC_HANDLERS.LOGS_GET_PATH, async () => {
    try {
      return { success: true, path: deps.logPath }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipc.handle(IPC_HANDLERS.LOGS_EXPORT, async () => {
    try {
      const desktop = deps.getDesktopPath()
      const destPath = join(desktop, `nir-monitor-${deps.now()}.log`)
      deps.writeFile(destPath, deps.readLog())
      return { success: true, path: destPath }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
