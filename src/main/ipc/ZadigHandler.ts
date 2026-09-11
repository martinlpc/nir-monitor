import { existsSync } from 'fs'
import { join } from 'path'
import { IPC_HANDLERS } from '../../shared/ipc-channels'
import type { IpcMainLike } from './ipcEnv'
import { sanitizeReThrow } from './ipcEnv'

const ZADIG_FILENAME = 'zadig-2.9.exe'

export interface ZadigOpenResult {
  success: boolean
  error?: string
}

export interface ZadigHandlerDeps {
  zadigPath: string
  openPath: (path: string) => Promise<string>
}

export function registerZadigHandlers(ipc: IpcMainLike, deps: ZadigHandlerDeps): void {
  ipc.handle(IPC_HANDLERS.ZADIG_OPEN, async (): Promise<ZadigOpenResult> => {
    try {
      if (!existsSync(deps.zadigPath)) {
        return { success: false, error: 'Zadig no se encuentra en la instalación.' }
      }
      const openError = await deps.openPath(deps.zadigPath)
      if (openError) {
        return { success: false, error: openError }
      }
      return { success: true }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })
}

export function resolveZadigPath(isPackaged: boolean, resourcesPath: string, cwd: string): string {
  const base = isPackaged ? resourcesPath : join(cwd, 'resources')
  return join(base, 'drivers', 'zadig', ZADIG_FILENAME)
}