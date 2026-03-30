// Handlers IPC para SessionService - sin lógica de negocio
// Solo orquesta: SessionService → Renderer
import { ipcMain, BrowserWindow } from 'electron'
import { IPC_EVENTS, IPC_HANDLERS } from './channels'
import type { DeviceManager } from '../services/DeviceManager'
import type { SessionService } from '../services/SessionService'
import type { GeoFusionConfig } from '../services/GeoFusionService'

/**
 * Registra handlers IPC para operaciones de sesión
 * Responsabilidad: solo orquestar, sin lógica de negocio
 */
export function registerSessionServiceHandlers(
  _window: BrowserWindow,
  _deviceManager: DeviceManager,
  sessionService: SessionService
): void {
  // session:start - inicia captura de puntos geofusionados
  // Responsabilidad: SOLO delegar a SessionService, que maneja el wiring interno
  ipcMain.handle(
    IPC_HANDLERS.SESSION_START,
    async (_, label: string, fusionConfig?: Partial<GeoFusionConfig>) => {
      try {
        // SessionService.start() internamente:
        // 1. Accede a NBM y GPS desde DeviceManager
        // 2. Walifica que estén conectados
        // 3. Wirifica GeoFusionService
        const sessionId = await sessionService.start(label, fusionConfig)
        return { success: true, sessionId }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // session:stop - detiene captura
  ipcMain.handle(IPC_HANDLERS.SESSION_STOP, async () => {
    try {
      const summary = await sessionService.stop()
      return { success: true, summary }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // session:list - retorna metadata de sesión actual
  ipcMain.handle(IPC_HANDLERS.SESSION_LIST, async () => {
    return sessionService.getSummary()
  })
}

/**
 * Vincula eventos de SessionService → Renderer (push)
 */
export function bindSessionServiceEvents(
  window: BrowserWindow,
  sessionService: SessionService
): void {
  const sendIfReady = (event: string, data: unknown) => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(event, data)
    }
  }

  sessionService.on('point', (point) => sendIfReady(IPC_EVENTS.SESSION_SAMPLE, point))
  sessionService.on('started', (info) => sendIfReady(IPC_EVENTS.SESSION_STARTED, info))
  sessionService.on('stopped', (summary) => sendIfReady(IPC_EVENTS.SESSION_STOPPED, summary))
}
