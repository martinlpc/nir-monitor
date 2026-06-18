// Handlers IPC para SessionService - sin lógica de negocio
// Solo orquesta: SessionService → Renderer
import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { IPC_EVENTS, IPC_HANDLERS } from './channels'
import { emitAlert } from './handlers'
import { encryptBuffer, decryptBuffer, isEncrypted } from '../services/CryptoService'
import type { DeviceManager } from '../services/DeviceManager'
import type { SessionService } from '../services/SessionService'
import type { GeoTimestamp } from '../../shared/GeoTimestamp'
import type { SessionSummary } from '../../shared/ipc.types'
import { v4 as uuidv4 } from 'uuid'

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
        provincia?: string
        localidad?: string
        apellido1?: string
        apellido2?: string
      }
    ) => {
      console.log(`[SessionServiceHandler] SESSION_START received, payload:`, payload)
      // SessionService.start() internamente:
      // 1. Accede a NBM y GPS desde DeviceManager
      // 2. Valifica que estén conectados
      // 3. Wirifica GeoFusionService
      const { label, provincia, localidad, apellido1, apellido2, ...fusionConfig } = payload
      console.log(
        `[SessionServiceHandler] Calling sessionService.start() with label="${label}" and fusionConfig:`,
        fusionConfig
      )
      try {
        const sessionId = await sessionService.start(label, fusionConfig, {
          provincia,
          localidad,
          apellido1,
          apellido2
        })
        console.log(`[SessionServiceHandler] sessionService.start() returned: ${sessionId}`)
        return sessionId
      } catch (err: unknown) {
        // Emitir alerta global al frontend
        const message = err instanceof Error ? err.message : String(err)
        emitAlert(_window, message || 'Error al iniciar sesión', 'error')
        throw err
      }
    }
  )

  // session:stop - detiene captura y exporta GeoJSON al escritorio
  ipcMain.handle(IPC_HANDLERS.SESSION_STOP, async () => {
    const summary = await sessionService.stop()

    // Auto-export GeoJSON cifrado al escritorio (obligatorio)
    const repository = sessionService.getRepository()
    if (summary?.localidad && summary?.id && repository) {
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
        const geojson = await repository.exportAsGeoJSON(summary.id)
        const encrypted = encryptBuffer(Buffer.from(geojson, 'utf-8'))
        fs.writeFileSync(filepath, encrypted)
        console.log(`[SessionServiceHandler] Encrypted GeoJSON saved to desktop: ${filepath}`)
      } catch (err) {
        console.warn('[SessionServiceHandler] Failed to save encrypted GeoJSON to desktop:', err)
      }
    }

    return summary
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

  // session:export - exporta con diálogo nativo (GeoJSON, XLSX, KMZ)
  ipcMain.handle(
    IPC_HANDLERS.SESSION_EXPORT,
    async (_, sessionId: string, format: 'geojson' | 'xlsx' | 'kmz', label: string) => {
      const repository = sessionService.getRepository()
      if (!repository) {
        return { success: false, error: 'Repository not available' }
      }

      const safeLabel = label.replace(/[<>:"/\\|?*]/g, '_')
      const defaultName = `${safeLabel}.${format === 'geojson' ? 'geojson.enc' : format}`

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
          const filePaths = await repository.exportAsXLSX(sessionId, folderPath, label)
          return { success: true, filePaths }
        } catch (err) {
          return { success: false, error: (err as Error).message }
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
          const data = await repository.exportAsGeoJSON(sessionId)
          const encrypted = encryptBuffer(Buffer.from(data, 'utf-8'))
          fs.writeFileSync(finalPath, encrypted)
        } else if (format === 'kmz') {
          while (finalPath.endsWith('.kmz')) {
            finalPath = finalPath.slice(0, -'.kmz'.length)
          }
          finalPath += '.kmz'
          const buffer = await repository.exportAsKMZ(sessionId)
          fs.writeFileSync(finalPath, buffer)
        }

        return { success: true, filePaths: [finalPath] }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // session:import-geojson - importa GeoJSON cifrado (o plano) como nueva sesión
  ipcMain.handle(IPC_HANDLERS.SESSION_IMPORT_GEOJSON, async () => {
    const repository = sessionService.getRepository()
    if (!repository) {
      return { success: false, error: 'Repository not available' }
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
      const sessionId = uuidv4()

      const metadata: SessionSummary = {
        id: sessionId,
        label: props.label || props.localidad || 'Importada',
        startedAt: props.startedAt ? new Date(props.startedAt).getTime() : now,
        stoppedAt: now,
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al importar GeoJSON'
      return { success: false, error: message }
    }
  })

  // session:stats - obtiene estadísticas pre-calculadas
  ipcMain.handle(IPC_HANDLERS.SESSION_STATS, async (_, sessionId: string) => {
    const repository = sessionService.getRepository()
    if (!repository) {
      return { success: false, error: 'Repository not available' }
    }
    try {
      const stats = await repository.getSessionStats(sessionId)
      return { success: true, stats }
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
        const points = await repository.getPointsInBounds(sessionId, north, south, east, west)
        return { success: true, points }
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
