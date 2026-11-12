import { describe, expect, it, vi } from 'vitest'
import { join } from 'path'
import { IPC_HANDLERS } from '../../shared/ipc-channels'
import {
  buildEncryptedDesktopFilename,
  buildImportedSession,
  registerSessionServiceHandlers,
  bindSessionServiceEvents,
  saveEncryptedCopyToDesktop,
  sanitizeExportLabel,
  withSingleExtension,
  DEFAULT_MAX_EXPORT_POINTS
} from './SessionServiceHandler'
import type {
  SessionServiceHandlerDeps,
  SessionServiceLike,
  ExportOrchestratorLike
} from './SessionServiceHandler'
import type { EventSink, DialogLike } from './ipcEnv'
import type { ISessionRepository } from '../../shared/services/ISessionRepository'
import type { SessionSummary } from '../../shared/ipc.types'
import type { GeoTimestamp } from '../../shared/GeoTimestamp'
import { createFakeIpc } from './ipcTestUtils'

const SESSION_ID = '9f9e1a5c-3c62-4a57-bf11-4a0e0b1f3c2d'

function makeRepo(): ISessionRepository {
  return {
    saveSession: vi.fn(async () => {}),
    initSession: vi.fn(async () => {}),
    addPoint: vi.fn(async () => {}),
    finalizeSession: vi.fn(async () => {}),
    flush: vi.fn(),
    getSession: vi.fn(async () => null),
    listSessions: vi.fn(async () => []),
    deleteSession: vi.fn(async () => {}),
    getSessionPoints: vi.fn(async () => []),
    getSessionStats: vi.fn(async () => null),
    getPointsInBounds: vi.fn(async () => [])
  }
}

function makeDeps(
  overrides: Partial<SessionServiceHandlerDeps> = {}
): SessionServiceHandlerDeps & { repo: ISessionRepository; sessionService: SessionServiceLike } {
  const repo = makeRepo()
  const sessionService: SessionServiceLike = {
    start: vi.fn(async () => SESSION_ID),
    stop: vi.fn(async () => null as unknown as SessionSummary),
    getState: vi.fn(() => 'idle'),
    getSummary: vi.fn(() => null),
    getRepository: vi.fn(() => repo),
    on: vi.fn()
  }
  const eventSink: EventSink = {
    send: vi.fn(),
    getWindow: vi.fn(() => ({}) as never),
    alert: vi.fn()
  }
  const dialog: DialogLike = {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn()
  }
  const exportOrchestrator: ExportOrchestratorLike = {
    export: vi.fn(async () => ({ data: '{"type":"FeatureCollection","features":[]}' }))
  }

  const deps: SessionServiceHandlerDeps = {
    eventSink,
    sessionService,
    exportOrchestrator,
    dialog,
    getDesktopPath: vi.fn(() => 'C:\\Desktop'),
    readFile: vi.fn(() => Buffer.from('')),
    writeFile: vi.fn(),
    encrypt: vi.fn((plaintext: Buffer) => plaintext),
    decrypt: vi.fn((ciphertext: Buffer) => ciphertext),
    isEncrypted: vi.fn(() => false),
    ...overrides
  }
  return { ...deps, repo, sessionService }
}

function validSessionJson(): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    properties: {
      session: {
        id: SESSION_ID,
        label: 'Recorrido prueba',
        localidad: 'Neuquén',
        provincia: 'Neuquén',
        startedAt: '2026-07-31T12:00:00.000Z'
      },
      instrument: null,
      correctionFactor: 1.08
    },
    features: [
      {
        geometry: { coordinates: [-68.1, -38.9, 300] },
        properties: {
          sequenceNumber: 1,
          timestamp: 1785542400000,
          rawMeasurement: 1.5,
          unit: 'V/m',
          correctedMeasurement: 1.62
        }
      },
      {
        geometry: { coordinates: [-68.2, -38.95, 301] },
        properties: {
          sequenceNumber: 2,
          timestamp: 1785542460000,
          rawMeasurement: 2,
          unit: 'V/m',
          gpsGap: true
        }
      }
    ]
  })
}

function validFeature(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    geometry: { coordinates: [-68.1, -38.9, 300] },
    properties: {
      timestamp: 1785542400000,
      rawMeasurement: 1.5,
      unit: 'V/m',
      correctedMeasurement: 1.62,
      ...overrides
    }
  }
}

function sessionJsonWith(features: unknown[]): string {
  const base = JSON.parse(validSessionJson())
  base.features = features
  return JSON.stringify(base)
}

describe('registerSessionServiceHandlers', () => {
  describe('session:start', () => {
    it('forwards payload fields and returns the session id', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_START)!(undefined, {
        label: 'Recorrido 1',
        triggerMode: 'distance',
        minDistanceMeters: 5,
        provincia: 'Neuquén',
        localidad: 'Neuquén'
      })

      expect(result).toBe(SESSION_ID)
      expect(deps.sessionService.start).toHaveBeenCalledWith(
        'Recorrido 1',
        { triggerMode: 'distance', minDistanceMeters: 5 },
        { provincia: 'Neuquén', localidad: 'Neuquén', apellido1: undefined, apellido2: undefined }
      )
    })

    it('maps errors to user messages and alerts the renderer', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.sessionService.start).mockRejectedValueOnce(new Error('port not found'))

      registerSessionServiceHandlers(ipc, deps)

      await expect(handlers.get(IPC_HANDLERS.SESSION_START)!(undefined, {})).rejects.toThrow(
        'Puerto serie no encontrado. Verificá la conexión del dispositivo.'
      )
      expect(deps.eventSink.alert).toHaveBeenCalledWith(
        'Puerto serie no encontrado. Verificá la conexión del dispositivo.',
        'error'
      )
    })
  })

  describe('session:stop', () => {
    it('writes an encrypted geojson to the desktop and returns the summary', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      const startedAt = Date.parse('2026-07-31T12:00:00.000Z')
      const summary: SessionSummary = {
        id: SESSION_ID,
        label: 'Recorrido 1',
        startedAt,
        stoppedAt: startedAt + 60000,
        sampleCount: 2,
        instrument: null,
        correctionFactor: 1.08,
        localidad: 'Neuquén'
      }
      vi.mocked(deps.sessionService.stop).mockResolvedValueOnce(summary)
      vi.mocked(deps.exportOrchestrator.export).mockResolvedValueOnce({
        data: '{"type":"FeatureCollection","features":[]}'
      })
      const encrypted = Buffer.from('ENCRYPTED')
      vi.mocked(deps.encrypt).mockReturnValueOnce(encrypted)

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_STOP)!(undefined)

      const filename = buildEncryptedDesktopFilename('Neuquén', startedAt)
      expect(result).toBe(summary)
      expect(deps.exportOrchestrator.export).toHaveBeenCalledWith(SESSION_ID, 'geojson')
      expect(deps.encrypt).toHaveBeenCalledWith(
        Buffer.from('{"type":"FeatureCollection","features":[]}', 'utf-8')
      )
      expect(deps.writeFile).toHaveBeenCalledWith(join('C:\\Desktop', filename), encrypted)
    })

    it('skips the desktop export when the summary has no localidad', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      const summary: SessionSummary = {
        id: SESSION_ID,
        label: 'Recorrido 1',
        startedAt: 0,
        stoppedAt: 1,
        sampleCount: 0,
        instrument: null,
        correctionFactor: null
      }
      vi.mocked(deps.sessionService.stop).mockResolvedValueOnce(summary)

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_STOP)!(undefined)

      expect(result).toBe(summary)
      expect(deps.exportOrchestrator.export).not.toHaveBeenCalled()
      expect(deps.writeFile).not.toHaveBeenCalled()
    })

    it('rethrows a sanitized error when stop fails', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.sessionService.stop).mockRejectedValueOnce(new Error('Session x not found'))

      registerSessionServiceHandlers(ipc, deps)

      await expect(handlers.get(IPC_HANDLERS.SESSION_STOP)!(undefined)).rejects.toThrow(
        'La sesión solicitada no existe.'
      )
    })
  })

  describe('session:list', () => {
    it('returns the current session summary', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      const summary: SessionSummary = {
        id: SESSION_ID,
        label: 'Recorrido 1',
        startedAt: 0,
        stoppedAt: null,
        sampleCount: 0,
        instrument: null,
        correctionFactor: null
      }
      vi.mocked(deps.sessionService.getSummary).mockReturnValueOnce(summary)

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_LIST)!(undefined)
      expect(result).toBe(summary)
    })
  })

  describe('session:list-persisted', () => {
    it('returns all persisted sessions', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      const sessions: SessionSummary[] = [
        {
          id: SESSION_ID,
          label: 'Recorrido 1',
          startedAt: 0,
          stoppedAt: null,
          sampleCount: 0,
          instrument: null,
          correctionFactor: null
        }
      ]
      vi.mocked(deps.repo.listSessions).mockResolvedValueOnce(sessions)

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_LIST_PERSISTED)!(undefined)
      expect(result).toBe(sessions)
    })

    it('returns an empty array when the repository is unavailable', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps({
        sessionService: { ...makeDeps().sessionService, getRepository: vi.fn(() => null) }
      })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_LIST_PERSISTED)!(undefined)
      expect(result).toEqual([])
    })

    it('returns an empty array when the repository fails', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.repo.listSessions).mockRejectedValueOnce(new Error('db locked'))

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_LIST_PERSISTED)!(undefined)
      expect(result).toEqual([])
    })
  })

  describe('session:get', () => {
    it('rejects invalid session ids', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_GET)!(undefined, 'not-a-uuid')
      expect(result).toEqual({ success: false, error: 'ID de sesión inválido.' })
      expect(deps.repo.getSession).not.toHaveBeenCalled()
    })

    it('returns the persisted session', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.repo.getSession).mockResolvedValueOnce({
        metadata: {} as SessionSummary,
        points: []
      })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_GET)!(undefined, SESSION_ID)
      expect(result).toEqual({ success: true, session: { metadata: {}, points: [] } })
    })

    it('returns an error result when the repository fails', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.repo.getSession).mockRejectedValueOnce(new Error('boom'))

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_GET)!(undefined, SESSION_ID)
      expect(result).toEqual({ success: false, error: 'Error al obtener la sesión.' })
    })
  })

  describe('session:delete', () => {
    it('deletes the session', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_DELETE)!(undefined, SESSION_ID)
      expect(result).toEqual({ success: true })
      expect(deps.repo.deleteSession).toHaveBeenCalledWith(SESSION_ID)
    })
  })

  describe('session:export-geojson', () => {
    it('returns the exported geojson with truncated flag', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.exportOrchestrator.export).mockResolvedValueOnce({
        data: '{"features":[]}',
        truncated: true
      })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_EXPORT_GEOJSON)!(undefined, SESSION_ID)
      expect(result).toEqual({ success: true, data: '{"features":[]}', truncated: true })
    })

    it('returns an error result on failure', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.exportOrchestrator.export).mockRejectedValueOnce(new Error('boom'))

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_EXPORT_GEOJSON)!(undefined, SESSION_ID)
      expect(result).toEqual({
        success: false,
        error: 'Error al exportar la sesión como GeoJSON.'
      })
    })
  })

  describe('session:export', () => {
    it('cancels when the folder picker is dismissed for xlsx', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.dialog.showOpenDialog).mockResolvedValueOnce({ canceled: true, filePaths: [] })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_EXPORT)!(
        undefined,
        SESSION_ID,
        'xlsx',
        'Recorrido: 1'
      )
      expect(result).toEqual({ success: false, canceled: true })
      expect(deps.exportOrchestrator.export).not.toHaveBeenCalled()
    })

    it('exports xlsx to the selected folder', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['C:\\out']
      })
      vi.mocked(deps.exportOrchestrator.export).mockResolvedValueOnce({
        data: ['C:\\out\\resumen.xlsx', 'C:\\out\\datos.xlsx']
      })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_EXPORT)!(
        undefined,
        SESSION_ID,
        'xlsx',
        'Recorrido: 1'
      )
      expect(deps.exportOrchestrator.export).toHaveBeenCalledWith(SESSION_ID, 'xlsx', {
        folderPath: 'C:\\out',
        label: 'Recorrido: 1'
      })
      expect(result).toEqual({
        success: true,
        filePaths: ['C:\\out\\resumen.xlsx', 'C:\\out\\datos.xlsx'],
        truncated: undefined
      })
    })

    it('marks the export as truncated when the point count exceeds the limit', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.repo.getSessionStats).mockResolvedValueOnce({
        avgCorrected: 1,
        maxCorrected: 2,
        minCorrected: 0,
        pointCount: DEFAULT_MAX_EXPORT_POINTS + 1
      })
      vi.mocked(deps.dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['C:\\out']
      })
      vi.mocked(deps.exportOrchestrator.export).mockResolvedValueOnce({ data: [] })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_EXPORT)!(
        undefined,
        SESSION_ID,
        'xlsx',
        'Recorrido 1'
      )
      expect(result).toEqual({ success: true, filePaths: [], truncated: true })
    })

    it('cancels when the save dialog is dismissed for geojson', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.dialog.showSaveDialog).mockResolvedValueOnce({ canceled: true, filePath: '' })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_EXPORT)!(
        undefined,
        SESSION_ID,
        'geojson',
        'Recorrido 1'
      )
      expect(result).toEqual({ success: false, canceled: true })
    })

    it('exports geojson encrypting and normalizing the extension', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.dialog.showSaveDialog).mockResolvedValueOnce({
        canceled: false,
        filePath: 'C:\\out\\x.geojson.enc.geojson.enc'
      })
      vi.mocked(deps.exportOrchestrator.export).mockResolvedValueOnce({
        data: '{"features":[]}'
      })
      const encrypted = Buffer.from('CIPHER')
      vi.mocked(deps.encrypt).mockReturnValueOnce(encrypted)

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_EXPORT)!(
        undefined,
        SESSION_ID,
        'geojson',
        'Recorrido 1'
      )
      expect(deps.dialog.showSaveDialog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: 'Exportar sesión como GEOJSON',
          defaultPath: 'Recorrido 1.geojson.enc'
        })
      )
      expect(deps.writeFile).toHaveBeenCalledWith('C:\\out\\x.geojson.enc', encrypted)
      expect(result).toEqual({
        success: true,
        filePaths: ['C:\\out\\x.geojson.enc'],
        truncated: undefined
      })
    })

    it('exports kmz normalizing the extension', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.dialog.showSaveDialog).mockResolvedValueOnce({
        canceled: false,
        filePath: 'C:\\out\\x.kmz.kmz'
      })
      const kmzBuffer = Buffer.from('KMZ')
      vi.mocked(deps.exportOrchestrator.export).mockResolvedValueOnce({ data: kmzBuffer })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_EXPORT)!(
        undefined,
        SESSION_ID,
        'kmz',
        'Recorrido 1'
      )
      expect(deps.writeFile).toHaveBeenCalledWith('C:\\out\\x.kmz', kmzBuffer)
      expect(result).toEqual({
        success: true,
        filePaths: ['C:\\out\\x.kmz'],
        truncated: undefined
      })
    })

    it('returns an error result when the export fails', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.dialog.showSaveDialog).mockResolvedValueOnce({
        canceled: false,
        filePath: 'C:\\out\\x.kmz'
      })
      vi.mocked(deps.exportOrchestrator.export).mockRejectedValueOnce(new Error('boom'))

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_EXPORT)!(
        undefined,
        SESSION_ID,
        'kmz',
        'Recorrido 1'
      )
      expect(result).toEqual({ success: false, error: 'Error al exportar la sesión.' })
    })
  })

  describe('session:import-geojson', () => {
    it('cancels when the file picker is dismissed', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.dialog.showOpenDialog).mockResolvedValueOnce({ canceled: true, filePaths: [] })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_IMPORT_GEOJSON)!(undefined)
      expect(result).toEqual({ success: false, canceled: true })
    })

    it('imports a plain geojson as a new session', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps({ readFile: vi.fn(() => Buffer.from(validSessionJson(), 'utf-8')) })
      vi.mocked(deps.dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['C:\\in\\s.geojson']
      })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_IMPORT_GEOJSON)!(undefined)
      expect(result).toEqual({
        success: true,
        sessionId: SESSION_ID,
        importedPoints: 2,
        skippedPoints: 0
      })
      // Un único guardado transaccional, sin pasar por el flujo incremental
      expect(deps.repo.saveSession).toHaveBeenCalledOnce()
      const [id, metadata, points] = vi.mocked(deps.repo.saveSession).mock.calls[0]
      expect(id).toBe(SESSION_ID)
      expect(metadata.sampleCount).toBe(2)
      expect(points).toHaveLength(2)
      expect(deps.repo.initSession).not.toHaveBeenCalled()
      expect(deps.repo.addPoint).not.toHaveBeenCalled()
      expect(deps.repo.finalizeSession).not.toHaveBeenCalled()
    })

    it('imports the valid points and reports how many were skipped', async () => {
      const { ipc, handlers } = createFakeIpc()
      const json = sessionJsonWith([
        validFeature(),
        validFeature({ rawMeasurement: undefined }),
        { geometry: null, properties: {} },
        validFeature({ timestamp: 1785542460000 })
      ])
      const deps = makeDeps({ readFile: vi.fn(() => Buffer.from(json, 'utf-8')) })
      vi.mocked(deps.dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['C:/in/s.geojson']
      })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_IMPORT_GEOJSON)!(undefined)
      expect(result).toEqual({
        success: true,
        sessionId: SESSION_ID,
        importedPoints: 2,
        skippedPoints: 2
      })
      expect(vi.mocked(deps.repo.saveSession).mock.calls[0][2]).toHaveLength(2)
    })

    it('imports files with more than 5000 points without truncating', async () => {
      const { ipc, handlers } = createFakeIpc()
      const features = Array.from({ length: 5200 }, (_, i) =>
        validFeature({ timestamp: 1785542400000 + i * 1000 })
      )
      const deps = makeDeps({
        readFile: vi.fn(() => Buffer.from(sessionJsonWith(features), 'utf-8'))
      })
      vi.mocked(deps.dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['C:/in/big.geojson']
      })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_IMPORT_GEOJSON)!(undefined)
      expect(result).toMatchObject({ success: true, importedPoints: 5200, skippedPoints: 0 })
    })

    it('rejects a file without any valid point', async () => {
      const { ipc, handlers } = createFakeIpc()
      const json = sessionJsonWith([validFeature({ unit: 'furlongs' }), { properties: {} }])
      const deps = makeDeps({ readFile: vi.fn(() => Buffer.from(json, 'utf-8')) })
      vi.mocked(deps.dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['C:/in/s.geojson']
      })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_IMPORT_GEOJSON)!(undefined)
      expect(result).toEqual({
        success: false,
        error: 'El archivo no tiene puntos válidos (2 descartados por datos faltantes o inválidos).'
      })
      expect(deps.repo.saveSession).not.toHaveBeenCalled()
    })

    it('refuses to import while a measurement is running', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.sessionService.getState).mockReturnValue('running')

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_IMPORT_GEOJSON)!(undefined)
      expect(result).toMatchObject({ success: false })
      expect((result as { error: string }).error).toContain('durante una medición')
      expect(deps.dialog.showOpenDialog).not.toHaveBeenCalled()
    })

    it('explains when the file cannot be decrypted', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps({
        readFile: vi.fn(() => Buffer.from('CIPHER')),
        isEncrypted: vi.fn(() => true),
        decrypt: vi.fn(() => {
          throw new Error('Unsupported state or unable to authenticate data')
        })
      })
      vi.mocked(deps.dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['C:/in/s.geojson.enc']
      })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_IMPORT_GEOJSON)!(undefined)
      expect((result as { error: string }).error).toContain('No se pudo descifrar')
    })

    it('reports points that already exist as a duplicate', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps({ readFile: vi.fn(() => Buffer.from(validSessionJson(), 'utf-8')) })
      vi.mocked(deps.dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['C:/in/s.geojson']
      })
      vi.mocked(deps.repo.saveSession).mockRejectedValueOnce(
        new Error('Cannot save session: Error: UNIQUE constraint failed: geo_points.id')
      )
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_IMPORT_GEOJSON)!(undefined)
      expect(result).toMatchObject({ success: false, duplicate: true })
      errorSpy.mockRestore()
    })

    it('returns an error result when saving fails', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps({ readFile: vi.fn(() => Buffer.from(validSessionJson(), 'utf-8')) })
      vi.mocked(deps.dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['C:/in/s.geojson']
      })
      vi.mocked(deps.repo.saveSession).mockRejectedValueOnce(new Error('disk full'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_IMPORT_GEOJSON)!(undefined)
      expect(result).toEqual({ success: false, error: 'Error al guardar la sesión importada.' })
      errorSpy.mockRestore()
    })

    it('decrypts encrypted geojson before importing', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps({
        readFile: vi.fn(() => Buffer.from('CIPHER')),
        isEncrypted: vi.fn(() => true),
        decrypt: vi.fn(() => Buffer.from(validSessionJson(), 'utf-8'))
      })
      vi.mocked(deps.dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['C:\\in\\s.geojson.enc']
      })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_IMPORT_GEOJSON)!(undefined)
      expect(result).toMatchObject({ success: true, sessionId: SESSION_ID })
      expect(deps.decrypt).toHaveBeenCalledWith(Buffer.from('CIPHER'))
    })

    it('flags a duplicate session', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps({ readFile: vi.fn(() => Buffer.from(validSessionJson(), 'utf-8')) })
      vi.mocked(deps.dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['C:\\in\\s.geojson']
      })
      vi.mocked(deps.repo.getSession).mockResolvedValueOnce({
        metadata: {} as SessionSummary,
        points: []
      })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_IMPORT_GEOJSON)!(undefined)
      expect(result).toEqual({
        success: false,
        duplicate: true,
        error: 'La sesión ya existe en la base de datos'
      })
      expect(deps.repo.saveSession).not.toHaveBeenCalled()
    })

    it('rejects a non-FeatureCollection file', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps({
        readFile: vi.fn(() => Buffer.from('{"type":"Feature","features":[]}', 'utf-8'))
      })
      vi.mocked(deps.dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['C:\\in\\bad.geojson']
      })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_IMPORT_GEOJSON)!(undefined)
      expect(result).toEqual({ success: false, error: 'El archivo no es un GeoJSON válido' })
    })

    it('returns an error result on unexpected failure', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps({ readFile: vi.fn(() => Buffer.from('not json', 'utf-8')) })
      vi.mocked(deps.dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['C:\\in\\s.geojson']
      })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_IMPORT_GEOJSON)!(undefined)
      expect(result).toEqual({
        success: false,
        error: 'El archivo no contiene un GeoJSON legible.'
      })
    })
  })

  describe('session:stats', () => {
    it('returns the precomputed stats', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      vi.mocked(deps.repo.getSessionStats).mockResolvedValueOnce({
        avgCorrected: 1.2,
        maxCorrected: 3.4,
        minCorrected: 0.1,
        pointCount: 42
      })

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_STATS)!(undefined, SESSION_ID)
      expect(result).toEqual({
        success: true,
        stats: { avgCorrected: 1.2, maxCorrected: 3.4, minCorrected: 0.1, pointCount: 42 }
      })
    })
  })

  describe('session:points-in-bounds', () => {
    it('forwards the bounding box to the repository', async () => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps()
      const points: GeoTimestamp[] = [
        {
          id: 'p1',
          sessionId: SESSION_ID,
          sequenceNumber: 1,
          timestamp: 0,
          position: { lat: -38.9, lon: -68.1, alt: 300 },
          emf: { deviceId: 'nbm550', rawMeasurement: 1, unit: 'V/m' },
          correctedMeasurement: 1
        }
      ]
      vi.mocked(deps.repo.getPointsInBounds).mockResolvedValueOnce(points)

      registerSessionServiceHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.SESSION_POINTS_IN_BOUNDS)!(
        undefined,
        SESSION_ID,
        -38,
        -39,
        -68,
        -69
      )
      expect(deps.repo.getPointsInBounds).toHaveBeenCalledWith(SESSION_ID, -38, -39, -68, -69)
      expect(result).toEqual({ success: true, points })
    })
  })
})

describe('pure helpers', () => {
  it('sanitizes illegal filename characters', () => {
    expect(sanitizeExportLabel('A:B\\C/D*E?F"G<H>I|J')).toBe('A_B_C_D_E_F_G_H_I_J')
  })

  it('builds an encrypted desktop filename from localidad and startedAt', () => {
    const startedAt = Date.parse('2026-07-31T12:34:56.000Z')
    const name = buildEncryptedDesktopFilename('Neuquén Capital', startedAt)
    expect(name).toMatch(/^Neuquén-Capital_\d{4}-\d{2}-\d{2}_\d{6}\.geojson\.enc$/)
    expect(name).toContain('2026-07-31')
  })

  it('normalizes a repeated extension', () => {
    expect(withSingleExtension('a.geojson.enc.geojson.enc', '.geojson.enc')).toBe('a.geojson.enc')
    expect(withSingleExtension('a.kmz.kmz', '.kmz')).toBe('a.kmz')
  })

  it('builds session metadata and points from a parsed geojson', () => {
    const now = (): number => 999
    let created = 0
    const idFactory = (): string => 'new-id-' + ++created
    const { sessionId, metadata, points } = buildImportedSession(JSON.parse(validSessionJson()), {
      idFactory,
      now
    })

    expect(sessionId).toBe(SESSION_ID)
    expect(metadata.label).toBe('Recorrido prueba')
    expect(metadata.correctionFactor).toBe(1.08)
    expect(metadata.sampleCount).toBe(2)
    expect(points).toHaveLength(2)
    expect(points[0]).toMatchObject({
      sequenceNumber: 1,
      position: { lat: -38.9, lon: -68.1, alt: 300 },
      emf: { deviceId: 'nbm550', rawMeasurement: 1.5, unit: 'V/m' },
      correctedMeasurement: 1.62
    })
    expect(points[1].sequenceNumber).toBe(2)
    expect(points[1].id).toBe('new-id-2')
    // Sin valor corregido en el archivo se calcula con el factor de la sesión
    expect(points[1].correctedMeasurement).toBeCloseTo(2 * 1.08)
    expect(points[1].gpsGap).toBe(true)
    expect(points[0].gpsGap).toBeUndefined()
  })

  it.each([
    ['missing coordinates', { geometry: {}, properties: validFeature().properties }],
    ['latitude out of range', { ...validFeature(), geometry: { coordinates: [-68, -91, 0] } }],
    ['longitude out of range', { ...validFeature(), geometry: { coordinates: [181, -38, 0] } }],
    ['non numeric coordinate', { ...validFeature(), geometry: { coordinates: ['a', -38, 0] } }],
    ['missing timestamp', validFeature({ timestamp: undefined })],
    ['unparseable timestamp', validFeature({ timestamp: 'not a date' })],
    ['missing measurement', validFeature({ rawMeasurement: undefined })],
    ['negative measurement', validFeature({ rawMeasurement: -1 })],
    ['non numeric measurement', validFeature({ rawMeasurement: '1.5' })],
    ['negative corrected value', validFeature({ correctedMeasurement: -0.1 })],
    ['missing unit', validFeature({ unit: undefined })],
    ['unknown unit', validFeature({ unit: 'dBm' })],
    ['null feature', null]
  ])('skips a feature with %s', (_name, feature) => {
    const geojson = JSON.parse(sessionJsonWith([validFeature(), feature]))

    const { points, skippedPoints, metadata } = buildImportedSession(geojson)

    expect(points).toHaveLength(1)
    expect(skippedPoints).toBe(1)
    expect(metadata.sampleCount).toBe(1)
  })

  it('accepts ISO timestamps, missing altitude and keeps valid point ids', () => {
    const geojson = JSON.parse(
      sessionJsonWith([
        {
          geometry: { coordinates: [-68.1, -38.9] },
          properties: {
            id: 'point-a',
            datetime: '2026-07-31T12:00:05.000Z',
            rawMeasurement: 0,
            unit: 'A/m',
            correctedMeasurement: 0
          }
        }
      ])
    )

    const { points, skippedPoints } = buildImportedSession(geojson)

    expect(skippedPoints).toBe(0)
    expect(points[0]).toMatchObject({
      id: 'point-a',
      timestamp: Date.parse('2026-07-31T12:00:05.000Z'),
      position: { lat: -38.9, lon: -68.1, alt: 0 },
      emf: { rawMeasurement: 0, unit: 'A/m' }
    })
  })

  it('skips a point whose id repeats inside the file', () => {
    const geojson = JSON.parse(
      sessionJsonWith([validFeature({ id: 'same' }), validFeature({ id: 'same' })])
    )

    const { points, skippedPoints } = buildImportedSession(geojson)

    expect(points).toHaveLength(1)
    expect(skippedPoints).toBe(1)
  })

  it('skips a point without corrected value when the session has no factor', () => {
    const geojson = JSON.parse(sessionJsonWith([validFeature({ correctedMeasurement: undefined })]))
    geojson.properties.correctionFactor = null

    expect(buildImportedSession(geojson).skippedPoints).toBe(1)
  })

  it('falls back to the point timestamps when the session dates are invalid', () => {
    const geojson = JSON.parse(
      sessionJsonWith([
        validFeature({ timestamp: 1785542400000 }),
        validFeature({ timestamp: 1785542460000 })
      ])
    )
    geojson.properties.session.startedAt = 'garbage'
    delete geojson.properties.session.stoppedAt

    const { metadata } = buildImportedSession(geojson)

    expect(metadata.startedAt).toBe(1785542400000)
    expect(metadata.stoppedAt).toBe(1785542460000)
  })

  it.each([['session-1'], [''], [12345], [null]])(
    'replaces a session id that is not a valid uuid (%j)',
    (badId) => {
      const NEW_ID = '0b7d6c1e-8a2f-4e3b-9c4d-5f6a7b8c9d0e'
      const geojson = JSON.parse(validSessionJson())
      geojson.properties.session.id = badId

      const { sessionId, metadata, points } = buildImportedSession(geojson, {
        idFactory: () => NEW_ID
      })

      expect(sessionId).toBe(NEW_ID)
      expect(metadata.id).toBe(NEW_ID)
      expect(points.every((p) => p.sessionId === NEW_ID)).toBe(true)
    }
  )
})

describe('bindSessionServiceEvents', () => {
  function bind(onAutoStopped?: (summary: SessionSummary) => Promise<void> | void): {
    deps: ReturnType<typeof makeDeps>
    emit: (event: string, payload: unknown) => void
  } {
    const deps = makeDeps()
    bindSessionServiceEvents(deps.eventSink, deps.sessionService, onAutoStopped)
    const emit = (event: string, payload: unknown): void => {
      for (const [name, listener] of vi.mocked(deps.sessionService.on).mock.calls) {
        if (name === event) listener(payload)
      }
    }
    return { deps, emit }
  }

  it('forwards alerts as errors by default', () => {
    const { deps, emit } = bind()

    emit('alert', { message: 'No se pudo guardar un punto' })

    expect(deps.eventSink.send).toHaveBeenCalledWith('session:alert', {
      message: 'No se pudo guardar un punto'
    })
    expect(deps.eventSink.alert).toHaveBeenCalledWith('No se pudo guardar un punto', 'error')
  })

  it('respects the alert severity when provided', () => {
    const { deps, emit } = bind()

    emit('alert', { message: 'Se alcanzó el límite', severity: 'warning' })

    expect(deps.eventSink.alert).toHaveBeenCalledWith('Se alcanzó el límite', 'warning')
  })

  it('runs the auto-stop callback with the session summary', () => {
    const onAutoStopped = vi.fn()
    const { emit } = bind(onAutoStopped)
    const summary = { id: SESSION_ID, localidad: 'Neuquén' } as SessionSummary

    emit('autoStopped', summary)

    expect(onAutoStopped).toHaveBeenCalledWith(summary)
  })

  it('tolerates an auto-stop without a callback', () => {
    const { emit } = bind()
    expect(() => emit('autoStopped', { id: SESSION_ID } as SessionSummary)).not.toThrow()
  })
})

describe('saveEncryptedCopyToDesktop', () => {
  const summary = {
    id: SESSION_ID,
    label: 'Recorrido 1',
    startedAt: Date.parse('2026-07-31T12:00:00.000Z'),
    stoppedAt: Date.parse('2026-07-31T12:01:00.000Z'),
    sampleCount: 2,
    instrument: null,
    correctionFactor: 1.08,
    localidad: 'Neuquén'
  } as SessionSummary

  it('writes the encrypted copy for an auto-stopped session', async () => {
    const deps = makeDeps()

    await saveEncryptedCopyToDesktop(deps, summary)

    expect(deps.exportOrchestrator.export).toHaveBeenCalledWith(SESSION_ID, 'geojson')
    expect(deps.writeFile).toHaveBeenCalledWith(
      join('C:\\Desktop', buildEncryptedDesktopFilename('Neuquén', summary.startedAt)),
      expect.any(Buffer)
    )
  })

  it('never throws when the export fails', async () => {
    const deps = makeDeps()
    vi.mocked(deps.exportOrchestrator.export).mockRejectedValueOnce(new Error('boom'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(saveEncryptedCopyToDesktop(deps, summary)).resolves.toBeUndefined()
    expect(deps.writeFile).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('does nothing without a summary', async () => {
    const deps = makeDeps()
    await saveEncryptedCopyToDesktop(deps, null)
    expect(deps.exportOrchestrator.export).not.toHaveBeenCalled()
  })
})
