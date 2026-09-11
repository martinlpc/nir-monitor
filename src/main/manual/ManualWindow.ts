import { BrowserWindow } from 'electron'
import type { BrowserWindowConstructorOptions } from 'electron'

export interface ManualWindowLike {
  loadFile(path: string, options?: { hash?: string }): Promise<void>
  isDestroyed(): boolean
  focus(): void
  show(): void
  on(event: string, listener: (...args: unknown[]) => void): this
  once(event: string, listener: (...args: unknown[]) => void): this
  destroy(): void
}

export interface ManualOpener {
  open(sectionId: string): Promise<void>
  close(): void
}

export interface ManualOpenerDeps {
  manualPath: string
  create?: (options: BrowserWindowConstructorOptions) => ManualWindowLike
}

export function createManualOpener(deps: ManualOpenerDeps): ManualOpener {
  let win: ManualWindowLike | null = null
  const createWindow =
    deps.create ??
    ((options: BrowserWindowConstructorOptions) => new BrowserWindow(options))

  function openWindow(sectionId: string): ManualWindowLike {
    const w = createWindow({
      width: 1000,
      height: 760,
      minWidth: 640,
      minHeight: 480,
      title: 'RNI Monitor - Manual de uso',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    void w.loadFile(deps.manualPath, { hash: sectionId })
    w.once('ready-to-show', () => w.show())
    w.on('closed', () => {
      win = null
    })
    return w
  }

  return {
    open(sectionId: string): Promise<void> {
      if (win && !win.isDestroyed()) {
        void win.loadFile(deps.manualPath, { hash: sectionId })
        win.focus()
        return Promise.resolve()
      }
      win = openWindow(sectionId)
      return Promise.resolve()
    },
    close(): void {
      win?.destroy()
      win = null
    }
  }
}