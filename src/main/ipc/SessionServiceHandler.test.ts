import { describe, expect, it, vi } from 'vitest'
import { join } from 'path'
import { IPC_HANDLERS } from './channels'
import {
  buildEncryptedDesktopFilename,
  buildImportedSession,
  registerSessionServiceHandlers,
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
        properties: { sequenceNumber: 2, timestamp: 1785542460000 }
      }
    ]
  })
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
      expect(result).toEqual({ success: true, sessionId: SESSION_ID })
      expect(deps.repo.initSession).toHaveBeenCalledOnce()
      expect(deps.repo.addPoint).toHaveBeenCalledTimes(2)
      expect(deps.repo.finalizeSession).toHaveBeenCalledOnce()
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
      expect(result).toEqual({ success: true, sessionId: SESSION_ID })
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
      expect(deps.repo.initSession).not.toHaveBeenCalled()
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
      expect(result).toEqual({ success: false, error: 'Error al importar el archivo GeoJSON.' })
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
    const idFactory = (): string => 'new-id'
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
    expect(points[1].id).toBe('new-id')
  })
})
