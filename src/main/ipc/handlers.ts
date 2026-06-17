import { BrowserWindow } from 'electron'
import { registerDeviceManagerHandlers, bindDeviceManagerEvents } from './DeviceManagerHandler'
import { registerSessionServiceHandlers, bindSessionServiceEvents } from './SessionServiceHandler'
import { registerSettingsHandlers } from './SettingsHandler'
import { registerTileCacheHandlers } from './TileCacheHandler'
import type { DeviceManager } from '../services/DeviceManager'
import type { SessionService } from '../services/SessionService'
import type { TileCacheService } from '../tile-cache/TileCacheService'
import { AlertLogger } from '../infrastructure/AlertLogger'

export function emitAlert(
  window: BrowserWindow,
  message: string,
  type: 'error' | 'warning' | 'info' = 'info'
): void {
  window.webContents.send('alert', { message, type })
  AlertLogger.log(message, type)
}

export function setupIPC(
  window: BrowserWindow,
  deviceManager: DeviceManager,
  sessionService: SessionService,
  tileCache?: TileCacheService
): void {
  deviceManager.removeAllListeners()
  sessionService.removeAllListeners()

  console.log('[IPC] Setting up IPC handlers...')

  registerDeviceManagerHandlers(window, deviceManager)
  registerSessionServiceHandlers(window, deviceManager, sessionService)
  registerSettingsHandlers(deviceManager)

  if (tileCache) {
    registerTileCacheHandlers(window, tileCache)
  }

  bindDeviceManagerEvents(window, deviceManager)
  bindSessionServiceEvents(window, sessionService)

  console.log('[IPC] All IPC handlers and event listeners registered')

  window.on('closed', () => {
    console.log('[IPC] Window closed - cleaning up listeners')
    deviceManager.removeAllListeners()
    sessionService.removeAllListeners()
  })
}
