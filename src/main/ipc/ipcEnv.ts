import type {
  BrowserWindow,
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue
} from 'electron'
import type { EventMap } from '../services/EventBus'
import { toUserError } from '../../shared/errors/toUserError'

export interface IpcMainLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handle(channel: string, listener: (event: unknown, ...args: any[]) => unknown): void
}

export interface DialogLike {
  showOpenDialog(window: BrowserWindow, options: OpenDialogOptions): Promise<OpenDialogReturnValue>
  showSaveDialog(window: BrowserWindow, options: SaveDialogOptions): Promise<SaveDialogReturnValue>
}

export interface AppEnv {
  getVersion(): string
  getAppPath(): string
  isPackaged: boolean
}

export interface EventSink {
  send<K extends keyof EventMap>(channel: K, data: EventMap[K]): void
  getWindow(): BrowserWindow | null
  alert(message: string, type?: 'error' | 'warning' | 'info', userAction?: string): void
}

export function sanitizeReThrow(err: unknown): never {
  const { message, technical } = toUserError(err)
  console.error(`[IPC] ${technical}`)
  throw new Error(message)
}
