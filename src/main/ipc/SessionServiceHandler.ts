import { join } from 'path'
import { IPC_HANDLERS } from '../../shared/ipc-channels'
import { toUserError } from '../../shared/errors/toUserError'
import { isValidSessionId } from '../../shared/validate'
import { v4 as uuidv4 } from 'uuid'
import type { IpcMainLike, DialogLike, EventSink } from './ipcEnv'
import { sanitizeReThrow } from './ipcEnv'
import type { SessionConfigInput } from '../services/SessionConfigBuilder'
import type { ExportResult } from '../export/IExporter'
import type { ISessionRepository } from '../../shared/services/ISessionRepository'
import type { InstrumentInfo, SessionSummary } from '../../shared/ipc.types'
import type { GeoTimestamp } from '../../shared/GeoTimestamp'

export const DEFAULT_MAX_EXPORT_POINTS = 5000

export interface SessionServiceLike {
  start(
    label?: string,
    fusionConfig?: SessionConfigInput,
    locationData?: {
      provincia?: string
      localidad?: string
      apellido1?: string
      apellido2?: string
    }
  ): Promise<string>
  stop(): Promise<SessionSummary>
  getSummary(): SessionSummary | null
  getRepository(): ISessionRepository | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): unknown
}

export interface ExportOrchestratorLike {
  export(
    sessionId: string,
    format: string,
    options?: { folderPath?: string; label?: string }
  ): Promise<ExportResult>
}

export interface SessionServiceHandlerDeps {
  eventSink: EventSink
  sessionService: SessionServiceLike
  exportOrchestrator: ExportOrchestratorLike
  dialog: DialogLike
  getDesktopPath: () => string
  readFile: (filePath: string) => Buffer
  writeFile: (filePath: string, data: Buffer) => void
  encrypt: (plaintext: Buffer) => Buffer
  decrypt: (ciphertext: Buffer) => Buffer
  isEncrypted: (buffer: Buffer) => boolean
  maxExportPoints?: number
}

function validateSessionId(sessionId: string): { success: false; error: string } | null {
  if (!sessionId || !isValidSessionId(sessionId)) {
    return { success: false, error: 'ID de sesión inválido.' }
  }
  return null
}

// ── Funciones puras ────────────────────────────────────────

export function sanitizeExportLabel(label: string): string {
  return label.replace(/[<>:"/\\|?*]/g, '_')
}

export function buildEncryptedDesktopFilename(localidad: string, startedAt: number): string {
  const startDate = new Date(startedAt)
  const fecha = startDate.toISOString().slice(0, 10)
  const hora = startDate.toTimeString().slice(0, 8).replace(/:/g, '')
  const loc = localidad.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '').replace(/\s+/g, '-')
  return `${loc}_${fecha}_${hora}.geojson.enc`
}

export function withSingleExtension(filePath: string, extension: string): string {
  let finalPath = filePath
  while (finalPath.endsWith(extension)) {
    finalPath = finalPath.slice(0, -extension.length)
  }
  return `${finalPath}${extension}`
}

export interface ImportedGeoFeatureProps {
  id?: string
  sequenceNumber?: number
  timestamp?: number | string
  datetime?: string
  rawMeasurement?: number
  unit?: 'V/m' | 'A/m' | 'mW/cm^2' | 'W/m^2'
  correctedMeasurement?: number
}

export interface ImportedGeoFeature {
  geometry?: { coordinates?: number[] }
  properties?: ImportedGeoFeatureProps
}

export interface ImportedGeoJson {
  type?: string
  features: ImportedGeoFeature[]
  properties?: {
    session?: {
      id?: string
      label?: string
      localidad?: string
      provincia?: string
      startedAt?: number | string
      stoppedAt?: number | string
      apellido1?: string
      apellido2?: string
    }
    instrument?: InstrumentInfo | null
    correctionFactor?: number | null
  }
}

export function buildImportedSession(
  geojson: ImportedGeoJson,
  options?: { idFactory?: () => string; now?: () => number }
): { sessionId: string; metadata: SessionSummary; points: GeoTimestamp[] } {
  const idFactory = options?.idFactory ?? uuidv4
  const now = options?.now ?? Date.now

  const props = geojson.properties?.session || {}
  const instrument = geojson.properties?.instrument ?? null
  const correctionFactor = geojson.properties?.correctionFactor ?? null
  const nowMs = now()

  // Un ID que no sea UUID v4 dejaría la sesión inaccesible: todos los handlers lo validan
  const sessionId =
    typeof props.id === 'string' && isValidSessionId(props.id) ? props.id : idFactory()

  const metadata: SessionSummary = {
    id: sessionId,
    label: props.label || props.localidad || 'Importada',
    startedAt: props.startedAt ? new Date(props.startedAt).getTime() : nowMs,
    stoppedAt: props.stoppedAt ? new Date(props.stoppedAt).getTime() : nowMs,
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

  const points: GeoTimestamp[] = geojson.features.map((feature, index) => {
    const [lon, lat, alt] = feature.geometry?.coordinates || [0, 0, 0]
    const featProps = feature.properties || {}
    return {
      id: featProps.id || idFactory(),
      sessionId,
      sequenceNumber: featProps.sequenceNumber ?? index + 1,
      timestamp: featProps.timestamp
        ? typeof featProps.timestamp === 'number'
          ? featProps.timestamp
          : new Date(featProps.datetime || featProps.timestamp).getTime()
        : nowMs,
      position: { lat, lon, alt: alt ?? 0 },
      emf: {
        deviceId: 'nbm550',
        rawMeasurement: featProps.rawMeasurement ?? 0,
        unit: featProps.unit || 'V/m'
      },
      correctedMeasurement: featProps.correctedMeasurement ?? 0
    }
  })

  return { sessionId, metadata, points }
}

// ── Registro de handlers ───────────────────────────────────

export function registerSessionServiceHandlers(
  ipc: IpcMainLike,
  deps: SessionServiceHandlerDeps
): void {
  const { eventSink, sessionService, exportOrchestrator } = deps
  const maxExportPoints = deps.maxExportPoints ?? DEFAULT_MAX_EXPORT_POINTS

  // session:start - inicia captura de puntos geofusionados
  ipc.handle(
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
      const { label, provincia, localidad, apellido1, apellido2, ...fusionConfig } = payload ?? {}
      try {
        return await sessionService.start(label, fusionConfig, {
          provincia,
          localidad,
          apellido1,
          apellido2
        })
      } catch (err) {
        const { message, technical } = toUserError(err)
        console.error(`[IPC] session:start error: ${technical}`)
        eventSink.alert(message || 'Error al iniciar sesión', 'error')
        throw new Error(message)
      }
    }
  )

  // session:stop - detiene captura y exporta GeoJSON al escritorio
  ipc.handle(IPC_HANDLERS.SESSION_STOP, async () => {
    try {
      const summary = await sessionService.stop()
      if (summary?.localidad && summary?.id) {
        const repository = sessionService.getRepository()
        if (repository) {
          try {
            const desktop = deps.getDesktopPath()
            const filename = buildEncryptedDesktopFilename(summary.localidad, summary.startedAt)
            const filepath = join(desktop, filename)
            const result = await exportOrchestrator.export(summary.id, 'geojson')
            const geojson = result.data as string
            const encrypted = deps.encrypt(Buffer.from(geojson, 'utf-8'))
            deps.writeFile(filepath, encrypted)
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
  ipc.handle(IPC_HANDLERS.SESSION_LIST, async () => {
    try {
      return sessionService.getSummary()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  // session:list-persisted - retorna lista de todas las sesiones guardadas
  ipc.handle(IPC_HANDLERS.SESSION_LIST_PERSISTED, async () => {
    const repository = sessionService.getRepository()
    if (!repository) {
      console.warn('[SessionServiceHandler] Repository not available')
      return []
    }
    try {
      return await repository.listSessions()
    } catch (err) {
      console.error('[SessionServiceHandler] SESSION_LIST_PERSISTED Error:', err)
      return []
    }
  })

  // session:get - obtiene sesión completa con puntos
  ipc.handle(IPC_HANDLERS.SESSION_GET, async (_, sessionId: string) => {
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
  ipc.handle(IPC_HANDLERS.SESSION_DELETE, async (_, sessionId: string) => {
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
  ipc.handle(IPC_HANDLERS.SESSION_EXPORT_GEOJSON, async (_, sessionId: string) => {
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
  ipc.handle(
    IPC_HANDLERS.SESSION_EXPORT,
    async (_, sessionId: string, format: 'geojson' | 'xlsx' | 'kmz', label: string) => {
      const invalid = validateSessionId(sessionId)
      if (invalid) return invalid

      const repository = sessionService.getRepository()
      if (!repository) {
        return { success: false, error: 'Repositorio no disponible.' }
      }

      const safeLabel = sanitizeExportLabel(label)
      const defaultName = `${safeLabel}.${format === 'geojson' ? 'geojson.enc' : format}`

      const stats = await repository.getSessionStats(sessionId)
      const pointCount = stats?.pointCount ?? 0
      const truncated = pointCount > maxExportPoints

      // XLSX: selector de carpeta, 2-3 archivos
      if (format === 'xlsx') {
        const folderResult = await deps.dialog.showOpenDialog(eventSink.getWindow()!, {
          title: 'Seleccionar carpeta para exportar XLSX',
          properties: ['openDirectory']
        })

        if (folderResult.canceled || !folderResult.filePaths?.[0]) {
          return { success: false, canceled: true }
        }

        const folderPath = folderResult.filePaths[0]

        try {
          const expResult = await exportOrchestrator.export(sessionId, 'xlsx', {
            folderPath,
            label
          })
          return {
            success: true,
            filePaths: expResult.data as string[],
            truncated: truncated || undefined
          }
        } catch {
          return { success: false, error: 'Error al exportar la sesión como XLSX.' }
        }
      }

      // GeoJSON / KMZ: selector de archivo único
      const filterMap = {
        geojson: { name: 'GeoJSON cifrado', extensions: ['geojson.enc'] },
        kmz: { name: 'Google Earth KMZ', extensions: ['kmz'] }
      }

      const result = await deps.dialog.showSaveDialog(eventSink.getWindow()!, {
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
          finalPath = withSingleExtension(finalPath, '.geojson.enc')
          const exported = await exportOrchestrator.export(sessionId, 'geojson')
          const encrypted = deps.encrypt(Buffer.from(exported.data as string, 'utf-8'))
          deps.writeFile(finalPath, encrypted)
        } else if (format === 'kmz') {
          finalPath = withSingleExtension(finalPath, '.kmz')
          const buffer = await exportOrchestrator.export(sessionId, 'kmz')
          deps.writeFile(finalPath, buffer.data as Buffer)
        }

        return { success: true, filePaths: [finalPath], truncated: truncated || undefined }
      } catch {
        return { success: false, error: 'Error al exportar la sesión.' }
      }
    }
  )

  // session:import-geojson - importa GeoJSON cifrado (o plano) como nueva sesión
  ipc.handle(IPC_HANDLERS.SESSION_IMPORT_GEOJSON, async () => {
    const repository = sessionService.getRepository()
    if (!repository) {
      return { success: false, error: 'Repositorio no disponible.' }
    }

    try {
      const result = await deps.dialog.showOpenDialog(eventSink.getWindow()!, {
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
      const raw = deps.readFile(filePath)
      let geojsonStr: string

      if (deps.isEncrypted(raw)) {
        geojsonStr = deps.decrypt(raw).toString('utf-8')
      } else {
        geojsonStr = raw.toString('utf-8')
      }

      const geojson = JSON.parse(geojsonStr) as ImportedGeoJson
      if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
        return { success: false, error: 'El archivo no es un GeoJSON válido' }
      }

      const { sessionId, metadata, points } = buildImportedSession(geojson)

      const existing = await repository.getSession(sessionId)
      if (existing) {
        return { success: false, duplicate: true, error: 'La sesión ya existe en la base de datos' }
      }

      await repository.initSession(sessionId, metadata)

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
  ipc.handle(IPC_HANDLERS.SESSION_STATS, async (_, sessionId: string) => {
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
  ipc.handle(
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
  eventSink: EventSink,
  sessionService: SessionServiceLike
): void {
  sessionService.on('point', (point) => eventSink.send('session:sample', point))
  sessionService.on('started', (info) => eventSink.send('session:started', info))
  sessionService.on('stopped', (summary) => eventSink.send('session:stopped', summary))
  sessionService.on('alert', (data) => {
    eventSink.send('session:alert', data)
    eventSink.alert(data.message, 'error')
  })
}
