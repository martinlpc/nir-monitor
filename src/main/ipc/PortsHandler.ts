import { IPC_HANDLERS } from './channels'
import type { IpcMainLike } from './ipcEnv'
import { sanitizeReThrow } from './ipcEnv'

export interface PortListItem {
  path: string
  manufacturer: string
}

export type ListPorts = () => Promise<PortListItem[]>

export function registerPortsHandlers(ipc: IpcMainLike, listPorts: ListPorts): void {
  ipc.handle(IPC_HANDLERS.PORTS_LIST, async () => {
    try {
      return await listPorts()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })
}
