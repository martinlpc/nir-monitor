import { pathToFileURL } from 'url'
import { join } from 'path'
import { IPC_HANDLERS } from '../../shared/ipc-channels'
import type { IpcMainLike } from './ipcEnv'
import { sanitizeReThrow } from './ipcEnv'

export interface ManualHandlerDeps {
  manualPath: string
  openUrl: (url: string) => Promise<void>
}

export function registerManualHandlers(ipc: IpcMainLike, deps: ManualHandlerDeps): void {
  ipc.handle(
    IPC_HANDLERS.MANUAL_OPEN_SECTION,
    async (_event: unknown, _sectionId: string): Promise<void> => {
      try {
        const section = _sectionId?.replace(/[^A-Za-z0-9-]/g, '') ?? ''
        const url = `${pathToFileURL(deps.manualPath).href}#${section}`
        await deps.openUrl(url)
      } catch (err) {
        sanitizeReThrow(err)
      }
    }
  )
}

export function resolveManualPath(isPackaged: boolean, resourcesPath: string, cwd: string): string {
  return isPackaged ? join(resourcesPath, 'manual.html') : join(cwd, 'docs', 'manual.html')
}