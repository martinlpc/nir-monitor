import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { IPC_EVENTS, IPC_HANDLERS } from './channels'
import { emitAlert } from './handlers'
import { toUserError } from '../../shared/errors/toUserError'
import { encryptBuffer, decryptBuffer, isEncrypted } from '../services/CryptoService'
import { isValidSessionId } from '../../shared/validate'
import { SQLiteSessionRepository } from '../services/SQLiteSessionRepository'
import type { DeviceManager } from '../services/DeviceManager'
import type { SessionService } from '../services/SessionService'
import type { GeoTimestamp } from '../../shared/GeoTimestamp'
import type { SessionSummary } from '../../shared/ipc.types'
import { v4 as uuidv4 } from 'uuid'
import { ExportOrchestrator } from '../export/ExportOrchestator'

function validateSessionId(sessionId: string): { success: false; error: string } | null {
  if (!sessionId || !isValidSessionId(sessionId)) {
    return { success: false, error: 'ID de sesión inválido.' }
  }
  return null
}

function sanitizeReThrow(err: unknown): never {
  const { message, technical } = toUserError(err)
  console.error(`[IPC] ${technical}`)
  throw new Error(message)
}

/**
 * Registra handlers IPC para operaciones de sesión
 */
export function registerSessionServiceHandlers(
  _window: BrowserWindow,
  _deviceManager: DeviceManager,
  sessionService: SessionService,
  exportOrchestrator: ExportOrchestrator
): void {
  // session:start - inicia captura de puntos geofusionados
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
        provincia?: string
        localidad?: string
        apellido1?: string
        apellido2?: string
      }
    ) => {
      const { label, provincia, localidad, apellido1, apellido2, ...fusionConfig } = payload
      try {
        const sessionId = await sessionService.start(label, fusionConfig, {
          provincia,
          localidad,
          apellido1,
          apellido2
        })
        return sessionId
      } catch (err) {
        const { message, technical } = toUserError(err)
        console.error(`[IPC] session:start error: ${technical}`)
        emitAlert(_window, message || 'Error al iniciar sesión', 'error')
        throw new Error(message)
      }
    }
  )

  // session:stop - detiene captura y exporta GeoJSON al escritorio
  ipcMain.handle(IPC_HANDLERS.SESSION_STOP, async () => {
    try {
      const summary = await sessionService.stop()
      if (summary?.localidad && summary?.id) {
        const repository = sessionService.getRepository()
        if (repository) {
          try {
            const desktop = app.getPath('desktop')
            const startDate = new Date(summary.startedAt)
            const fecha = startDate.toISOString().slice(0, 10)
            const hora = startDate.toTimeString().slice(0, 8).replace(/:/g, '')
            const loc = summary.localidad
              .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '')
              .replace(/\s+/g, '-')
            const filename = `${loc}_${fecha}_${hora}.geojson.enc`
            const filepath = path.join(desktop, filename)
            const result = await exportOrchestrator.export(summary.id, 'geojson')
            const geojson = result.data as string
            const encrypted = encryptBuffer(Buffer.from(geojson, 'utf-8'))
            fs.writeFileSync(filepath, encrypted)
            console.log(`[SessionServiceHandler] Encrypted GeoJSON saved to desktop: ${filepath}`)
          } catch (innerErr) {
            console.warn(
              '[SessionServiceHandler] Failed to save encrypted GeoJSON to desktop:',
              innerErr
            )
          }
        }
      }
      return summary
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  // session:list - retorna metadata de sesión actual
  ipcMain.handle(IPC_HANDLERS.SESSION_LIST, async () => {
    try {
      return sessionService.getSummary()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  // session:list-persisted - retorna lista de todas las sesiones guardadas
  ipcMain.handle(IPC_HANDLERS.SESSION_LIST_PERSISTED, async () => {
    const repository = sessionService.getRepository()
    if (!repository) {
      console.warn('[SessionServiceHandler] Repository not available')
      return []
    }
    try {
      const sessions = await repository.listSessions()
      return sessions
    } catch (err) {
      console.error('[SessionServiceHandler] SESSION_LIST_PERSISTED Error:', err)
      return []
    }
  })

  // session:get - obtiene sesión completa con puntos
  ipcMain.handle(IPC_HANDLERS.SESSION_GET, async (_, sessionId: string) => {
    const invalid = validateSessionId(sessionId)
    if (invalid) return invalid

    const repository = sessionService.getRepository()
    if (!repository) {
      return { success: false, error: 'Repositorio no disponible.' }
    }
    try {
      const session = await repository.getSession(sessionId)
      return { success: true, session }
    } catch {
      return { success: false, error: 'Error al obtener la sesión.' }
    }
  })

  // session:delete - elimina sesión guardada
  ipcMain.handle(IPC_HANDLERS.SESSION_DELETE, async (_, sessionId: string) => {
    const invalid = validateSessionId(sessionId)
    if (invalid) return invalid

    const repository = sessionService.getRepository()
    if (!repository) {
      return { success: false, error: 'Repositorio no disponible.' }
    }
    try {
      await repository.deleteSession(sessionId)
      return { success: true }
    } catch {
      return { success: false, error: 'Error al eliminar la sesión.' }
    }
  })

  // session:export-geojson - exporta como GeoJSON
  ipcMain.handle(IPC_HANDLERS.SESSION_EXPORT_GEOJSON, async (_, sessionId: string) => {
    const invalid = validateSessionId(sessionId)
    if (invalid) return invalid

    const repository = sessionService.getRepository()
    if (!repository) {
      return { success: false, error: 'Repositorio no disponible.' }
    }
    try {
      const result = await exportOrchestrator.export(sessionId, 'geojson')
      return { success: true, data: result.data as string, truncated: result.truncated }
    } catch {
      return { success: false, error: 'Error al exportar la sesión como GeoJSON.' }
    }
  })

  // session:export - exporta con diálogo nativo (GeoJSON, XLSX, KMZ)
  ipcMain.handle(
    IPC_HANDLERS.SESSION_EXPORT,
    async (_, sessionId: string, format: 'geojson' | 'xlsx' | 'kmz', label: string) => {
      const invalid = validateSessionId(sessionId)
      if (invalid) return invalid

      const repository = sessionService.getRepository()
      if (!repository) {
        return { success: false, error: 'Repositorio no disponible.' }
      }

      const safeLabel = label.replace(/[<>:"/\\|?*]/g, '_')
      const defaultName = `${safeLabel}.${format === 'geojson' ? 'geojson.enc' : format}`

      const stats = await repository.getSessionStats(sessionId)
      const pointCount = stats?.pointCount ?? 0
      const truncated = pointCount > SQLiteSessionRepository.MAX_EXPORT_POINTS

      // XLSX: selector de carpeta, 2-3 archivos
      if (format === 'xlsx') {
        const folderResult = await dialog.showOpenDialog(_window, {
          title: 'Seleccionar carpeta para exportar XLSX',
          properties: ['openDirectory']
        })

        if (folderResult.canceled || !folderResult.filePaths?.[0]) {
          return { success: false, canceled: true }
        }

        const folderPath = folderResult.filePaths[0]

        try {
          const expResult = await exportOrchestrator.export(sessionId, 'xlsx', { folderPath, label })
          return { success: true, filePaths: expResult.data as string[], truncated: truncated || undefined }
        } catch {
          return { success: false, error: 'Error al exportar la sesión como XLSX.' }
        }
      }

      // GeoJSON / KMZ: selector de archivo único
      const filterMap = {
        geojson: { name: 'GeoJSON cifrado', extensions: ['geojson.enc'] },
        kmz: { name: 'Google Earth KMZ', extensions: ['kmz'] }
      }

      const result = await dialog.showSaveDialog(_window, {
        title: `Exportar sesión como ${format.toUpperCase()}`,
        defaultPath: defaultName,
        filters: [filterMap[format]]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true }
      }

      try {
        let finalPath = result.filePath

        if (format === 'geojson') {
          while (finalPath.endsWith('.geojson.enc')) {
            finalPath = finalPath.slice(0, -'.geojson.enc'.length)
          }
          finalPath += '.geojson.enc'
          const result = await exportOrchestrator.export(sessionId, 'geojson')
          const encrypted = encryptBuffer(Buffer.from(result.data as string, 'utf-8'))
          fs.writeFileSync(finalPath, encrypted)
        } else if (format === 'kmz') {
          while (finalPath.endsWith('.kmz')) {
            finalPath = finalPath.slice(0, -'.kmz'.length)
          }
          finalPath += '.kmz'
          const buffer = await exportOrchestrator.export(sessionId, 'kmz')
          fs.writeFileSync(finalPath, buffer.data as Buffer)
        }

        return { success: true, filePaths: [finalPath], truncated: truncated || undefined }
      } catch {
        return { success: false, error: 'Error al exportar la sesión.' }
      }
    }
  )

  // session:import-geojson - importa GeoJSON cifrado (o plano) como nueva sesión
  ipcMain.handle(IPC_HANDLERS.SESSION_IMPORT_GEOJSON, async () => {
    const repository = sessionService.getRepository()
    if (!repository) {
      return { success: false, error: 'Repositorio no disponible.' }
    }

    try {
      const result = await dialog.showOpenDialog(_window, {
        title: 'Importar GeoJSON',
        filters: [
          { name: 'GeoJSON cifrado', extensions: ['geojson.enc'] },
          { name: 'GeoJSON', extensions: ['geojson'] },
          { name: 'Todos los archivos', extensions: ['*'] }
        ],
        properties: ['openFile']
      })

      if (result.canceled || !result.filePaths?.[0]) {
        return { success: false, canceled: true }
      }

      const filePath = result.filePaths[0]
      const raw = fs.readFileSync(filePath)
      let geojsonStr: string

      if (isEncrypted(raw)) {
        const decrypted = decryptBuffer(raw)
        geojsonStr = decrypted.toString('utf-8')
      } else {
        geojsonStr = raw.toString('utf-8')
      }

      const geojson = JSON.parse(geojsonStr)
      if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
        return { success: false, error: 'El archivo no es un GeoJSON válido' }
      }

      const props = geojson.properties?.session || {}
      const instrument = geojson.properties?.instrument || null
      const correctionFactor = geojson.properties?.correctionFactor ?? null
      const now = Date.now()

      const originalId = props.id || uuidv4()

      const existing = await repository.getSession(originalId)
      if (existing) {
        return { success: false, duplicate: true, error: 'La sesión ya existe en la base de datos' }
      }

      const sessionId = originalId

      const metadata: SessionSummary = {
        id: sessionId,
        label: props.label || props.localidad || 'Importada',
        startedAt: props.startedAt ? new Date(props.startedAt).getTime() : now,
        stoppedAt: props.stoppedAt ? new Date(props.stoppedAt).getTime() : now,
        sampleCount: geojson.features.length,
        instrument: instrument
          ? {
              meter: instrument.meter,
              probe: instrument.probe
            }
          : null,
        correctionFactor,
        provincia: props.provincia || undefined,
        localidad: props.localidad || undefined,
        apellido1: props.apellido1 || undefined,
        apellido2: props.apellido2 || undefined
      }

      await repository.initSession(sessionId, metadata)

      interface GeoFeatureProps {
        id?: string
        sequenceNumber?: number
        timestamp?: number | string
        datetime?: string
        rawMeasurement?: number
        unit?: string
        correctedMeasurement?: number
      }
      interface GeoFeature {
        geometry?: { coordinates?: number[] }
        properties?: GeoFeatureProps
      }
      const points: GeoTimestamp[] = geojson.features.map((feature: GeoFeature, index: number) => {
        const [lon, lat, alt] = feature.geometry?.coordinates || [0, 0, 0]
        const featProps = feature.properties || {}
        return {
          id: featProps.id || uuidv4(),
          sessionId,
          sequenceNumber: featProps.sequenceNumber ?? index + 1,
          timestamp: featProps.timestamp
            ? typeof featProps.timestamp === 'number'
              ? featProps.timestamp
              : new Date(featProps.datetime || featProps.timestamp).getTime()
            : now,
          position: { lat, lon, alt: alt ?? 0 },
          emf: {
            deviceId: 'nbm550',
            rawMeasurement: featProps.rawMeasurement ?? 0,
            unit: featProps.unit || 'V/m'
          },
          correctedMeasurement: featProps.correctedMeasurement ?? 0
        }
      })

      for (const point of points) {
        await repository.addPoint(sessionId, point)
      }

      await repository.finalizeSession(sessionId, metadata)

      return { success: true, sessionId }
    } catch {
      return { success: false, error: 'Error al importar el archivo GeoJSON.' }
    }
  })

  // session:stats - obtiene estadísticas pre-calculadas
  ipcMain.handle(IPC_HANDLERS.SESSION_STATS, async (_, sessionId: string) => {
    const invalid = validateSessionId(sessionId)
    if (invalid) return invalid

    const repository = sessionService.getRepository()
    if (!repository) {
      return { success: false, error: 'Repositorio no disponible.' }
    }
    try {
      const stats = await repository.getSessionStats(sessionId)
      return { success: true, stats }
    } catch {
      return { success: false, error: 'Error al obtener las estadísticas.' }
    }
  })

  // session:points-in-bounds - buscar puntos en región geográfica
  ipcMain.handle(
    IPC_HANDLERS.SESSION_POINTS_IN_BOUNDS,
    async (_, sessionId: string, north: number, south: number, east: number, west: number) => {
      const invalid = validateSessionId(sessionId)
      if (invalid) return invalid

      const repository = sessionService.getRepository()
      if (!repository) {
        return { success: false, error: 'Repositorio no disponible.' }
      }
      try {
        const points = await repository.getPointsInBounds(sessionId, north, south, east, west)
        return { success: true, points }
      } catch {
        return { success: false, error: 'Error al buscar puntos en la región.' }
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
  const sendIfReady = (event: string, data: unknown): void => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(event, data)
    }
  }

  sessionService.on('point', (point) => sendIfReady(IPC_EVENTS.SESSION_SAMPLE, point))
  sessionService.on('started', (info) => sendIfReady(IPC_EVENTS.SESSION_STARTED, info))
  sessionService.on('stopped', (summary) => sendIfReady(IPC_EVENTS.SESSION_STOPPED, summary))
  sessionService.on('alert', (data) => {
    sendIfReady(IPC_EVENTS.SESSION_ALERT, data)
    emitAlert(window, data.message, 'error')
  })
}
