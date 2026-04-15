import { BrowserWindow } from 'electron'
import { registerDeviceManagerHandlers, bindDeviceManagerEvents } from './DeviceManagerHandler'
import { registerSessionServiceHandlers, bindSessionServiceEvents } from './SessionServiceHandler'
import { registerSettingsHandlers } from './SettingsHandler'
import type { DeviceManager } from '../services/DeviceManager'
import type { SessionService } from '../services/SessionService'

// -- Setup -----------------------------------------------------------
// Registrar handlers y conectar eventos de servicios hacia el Renderer
// vía webContents.send()
// Delegación: handlers específicos están en DeviceManagerHandler y SessionServiceHandler

export function setupIPC(
  window: BrowserWindow,
  deviceManager: DeviceManager,
  sessionService: SessionService
): void {
  // CRÍTICO: Limpiar listeners viejos ANTES de registrar nuevos
  // Esto previene duplicados cuando se abre múltiples ventanas o al recargar
  deviceManager.removeAllListeners()
  sessionService.removeAllListeners()

  console.log('[IPC] Setting up IPC handlers...')

  // Registrar handlers (Renderer -> Main request/response)
  registerDeviceManagerHandlers(window, deviceManager)
  registerSessionServiceHandlers(window, deviceManager, sessionService)
  registerSettingsHandlers(window, deviceManager)

  // Vincular eventos (Main -> Renderer push)
  bindDeviceManagerEvents(window, deviceManager)
  bindSessionServiceEvents(window, sessionService)

  console.log('[IPC] ✓ All IPC handlers and event listeners registered')

  // Limpiar listeners cuando se cierra ventana
  window.on('closed', () => {
    console.log('[IPC] Window closed - cleaning up listeners')
    deviceManager.removeAllListeners()
    sessionService.removeAllListeners()
  })
}
