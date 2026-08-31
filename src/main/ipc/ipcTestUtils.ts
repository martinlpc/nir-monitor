import type { IpcMainLike } from './ipcEnv'

export interface FakeIpc {
  ipc: IpcMainLike
  handlers: Map<string, (event: unknown, ...args: unknown[]) => unknown>
}

export function createFakeIpc(): FakeIpc {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  const ipc: IpcMainLike = {
    handle: (channel, listener) => {
      handlers.set(channel, listener)
    }
  }
  return { ipc, handlers }
}
