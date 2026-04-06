// Handlers IPC para SessionService - sin lógica de negocio
// Solo orquesta: SessionService → Renderer
import { ipcMain, BrowserWindow } from 'electron'
import { IPC_EVENTS, IPC_HANDLERS } from './channels'
import type { DeviceManager } from '../services/DeviceManager'
import type { SessionService } from '../services/SessionService'

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
    async (
      _,
      payload: {
        label?: string
        triggerMode?: 'distance' | 'time'
        minDistanceMeters?: number
        intervalMs?: number
        testMode?: boolean
      }
    ) => {
      try {
        console.log(`[SessionServiceHandler] SESSION_START received, payload:`, payload)
        // SessionService.start() internamente:
        // 1. Accede a NBM y GPS desde DeviceManager
        // 2. Valifica que estén conectados
        // 3. Wirifica GeoFusionService
        const { label, ...fusionConfig } = payload
        console.log(
          `[SessionServiceHandler] Calling sessionService.start() with label="${label}" and fusionConfig:`,
          fusionConfig
        )
        const sessionId = await sessionService.start(label, fusionConfig)
        console.log(`[SessionServiceHandler] sessionService.start() returned: ${sessionId}`)
        return { success: true, sessionId }
      } catch (err) {
        console.error(`[SessionServiceHandler] SESSION_START error:`, err)
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

  // session:list-persisted - retorna lista de todas las sesiones guardadas
  ipcMain.handle(IPC_HANDLERS.SESSION_LIST_PERSISTED, async () => {
    const repository = sessionService.getRepository()
    if (!repository) {
      console.warn('[SessionServiceHandler] Repository not available')
      return []
    }
    try {
      console.log('[SessionServiceHandler] SESSION_LIST_PERSISTED - querying repository...')
      const sessions = await repository.listSessions()
      console.log(
        `[SessionServiceHandler] SESSION_LIST_PERSISTED - returning ${sessions.length} sessions`
      )
      return sessions
    } catch (err) {
      console.error('[SessionServiceHandler] SESSION_LIST_PERSISTED Error:', err)
      return []
    }
  })

  // session:get - obtiene sesión completa con puntos
  ipcMain.handle(IPC_HANDLERS.SESSION_GET, async (_, sessionId: string) => {
    const repository = sessionService.getRepository()
    if (!repository) {
      return { success: false, error: 'Repository not available' }
    }
    try {
      const session = await repository.getSession(sessionId)
      return { success: true, session }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // session:delete - elimina sesión guardada
  ipcMain.handle(IPC_HANDLERS.SESSION_DELETE, async (_, sessionId: string) => {
    const repository = sessionService.getRepository()
    if (!repository) {
      return { success: false, error: 'Repository not available' }
    }
    try {
      await repository.deleteSession(sessionId)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // session:export-geojson - exporta como GeoJSON
  ipcMain.handle(IPC_HANDLERS.SESSION_EXPORT_GEOJSON, async (_, sessionId: string) => {
    const repository = sessionService.getRepository()
    if (!repository) {
      return { success: false, error: 'Repository not available' }
    }
    try {
      const geojson = await repository.exportAsGeoJSON(sessionId)
      return { success: true, data: geojson }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // session:export-csv - exporta como CSV
  ipcMain.handle(IPC_HANDLERS.SESSION_EXPORT_CSV, async (_, sessionId: string) => {
    const repository = sessionService.getRepository()
    if (!repository) {
      return { success: false, error: 'Repository not available' }
    }
    try {
      const csv = await repository.exportAsCSV(sessionId)
      return { success: true, data: csv }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // session:stats - obtiene estadísticas pre-calculadas
  ipcMain.handle(IPC_HANDLERS.SESSION_STATS, async (_, sessionId: string) => {
    const repository = sessionService.getRepository()
    if (!repository) {
      return { success: false, error: 'Repository not available' }
    }
    try {
      // Verificar si el repositorio tiene el método getSessionStats
      if ('getSessionStats' in repository) {
        const stats = await (repository as any).getSessionStats(sessionId)
        return { success: true, stats }
      } else {
        return { success: false, error: 'Stats not available' }
      }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // session:points-in-bounds - buscar puntos en región geográfica
  ipcMain.handle(
    IPC_HANDLERS.SESSION_POINTS_IN_BOUNDS,
    async (_, sessionId: string, north: number, south: number, east: number, west: number) => {
      const repository = sessionService.getRepository()
      if (!repository) {
        return { success: false, error: 'Repository not available' }
      }
      try {
        // Verificar si el repositorio tiene el método getPointsInBounds
        if ('getPointsInBounds' in repository) {
          const points = await (repository as any).getPointsInBounds(
            sessionId,
            north,
            south,
            east,
            west
          )
          return { success: true, points }
        } else {
          return { success: false, error: 'Spatial queries not available' }
        }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )
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
