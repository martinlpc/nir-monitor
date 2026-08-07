import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { app } from 'electron'
import { SQLiteSessionRepository } from './SQLiteSessionRepository'
import { isEncrypted } from './CryptoService'
import type { GeoTimestamp, GeoPosition } from '../../shared/GeoTimestamp'
import type { SessionSummary } from '../../shared/ipc.types'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/nir-test') },
  BrowserWindow: { getAllWindows: vi.fn(() => []) }
}))

const NEUQUEN: GeoPosition = { lat: -38.9516, lon: -68.0591, alt: 271 }

function makePoint(overrides: Partial<GeoTimestamp> = {}): GeoTimestamp {
  return {
    id: uuidv4(),
    sessionId: '',
    sequenceNumber: 1,
    timestamp: Date.now(),
    position: { ...NEUQUEN },
    emf: { deviceId: 'nbm550', rawMeasurement: 5.0, unit: 'V/m' },
    correctedMeasurement: 5.4,
    ...overrides
  }
}

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  const startedAt = Date.now() - 60000
  return {
    id: uuidv4(),
    label: 'Recorrido test',
    startedAt,
    stoppedAt: startedAt + 60000,
    sampleCount: 0,
    instrument: {
      meter: {
        brand: 'Narda',
        model: 'NBM-550',
        serial: 'SN-001',
        lastCalibrationDate: '2025-01-01T00:00:00Z'
      },
      probe: {
        brand: 'Narda',
        model: 'EF0391',
        serial: 'PROBE-001',
        calibrationDate: '2025-01-01T00:00:00Z'
      }
    },
    correctionFactor: 1.08,
    provincia: 'Neuquén',
    localidad: 'Neuquén',
    apellido1: 'García',
    apellido2: 'López',
    ...overrides
  }
}

async function createSchema(db: SqlJsDatabase): Promise<void> {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      startedAt TEXT NOT NULL,
      stoppedAt TEXT,
      sampleCount INTEGER NOT NULL DEFAULT 0,
      correctionFactor REAL,
      instrument TEXT,
      provincia TEXT,
      localidad TEXT,
      apellido1 TEXT,
      apellido2 TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS geo_points (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      sequenceNumber INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      alt REAL,
      rawMeasurement REAL NOT NULL,
      correctedMeasurement REAL NOT NULL,
      unit TEXT NOT NULL,
      gps_gap INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS session_stats (
      sessionId TEXT PRIMARY KEY,
      avgCorrected REAL,
      maxCorrected REAL,
      minCorrected REAL,
      pointCount INTEGER,
      computedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_geo_session_id ON geo_points(sessionId);
    CREATE INDEX IF NOT EXISTS idx_geo_timestamp ON geo_points(timestamp);
    CREATE INDEX IF NOT EXISTS idx_geo_lat_lon ON geo_points(lat, lon);
  `)
}

describe('SQLiteSessionRepository (in-memory)', () => {
  let repo: SQLiteSessionRepository
  let db: SqlJsDatabase

  beforeEach(async () => {
    const SQL = await initSqlJs()
    db = new SQL.Database()
    await createSchema(db)
    repo = new SQLiteSessionRepository({ testDb: db })
  })

  afterEach(() => {
    repo.close()
  })

  // ── initSession ──────────────────────────────────────────────

  it('initializes a session with metadata', async () => {
    const meta = makeSession()
    await repo.initSession(meta.id, meta)

    const sessions = await repo.listSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe(meta.id)
    expect(sessions[0].label).toBe('Recorrido test')
    expect(sessions[0].startedAt).toBe(meta.startedAt)
    expect(sessions[0].stoppedAt).toBeNull()
    expect(sessions[0].sampleCount).toBe(0)
    expect(sessions[0].correctionFactor).toBe(1.08)
    expect(sessions[0].provincia).toBe('Neuquén')
    expect(sessions[0].localidad).toBe('Neuquén')
    expect(sessions[0].apellido1).toBe('García')
    expect(sessions[0].apellido2).toBe('López')
  })

  it('stores instrument as serialized JSON', async () => {
    const meta = makeSession()
    await repo.initSession(meta.id, meta)

    const loaded = await repo.getSession(meta.id)
    expect(loaded?.metadata.instrument?.meter.brand).toBe('Narda')
    expect(loaded?.metadata.instrument?.probe.model).toBe('EF0391')
  })

  // ── addPoint ─────────────────────────────────────────────────

  it('adds a single point and updates sampleCount', async () => {
    const meta = makeSession()
    await repo.initSession(meta.id, meta)

    const point = makePoint({ sessionId: meta.id, sequenceNumber: 1, correctedMeasurement: 5.4 })
    await repo.addPoint(meta.id, point)

    const points = await repo.getSessionPoints(meta.id)
    expect(points).toHaveLength(1)
    expect(points[0].id).toBe(point.id)
    expect(points[0].sessionId).toBe(meta.id)
    expect(points[0].sequenceNumber).toBe(1)
    expect(points[0].correctedMeasurement).toBe(5.4)
    expect(points[0].position.lat).toBe(NEUQUEN.lat)
    expect(points[0].emf.rawMeasurement).toBe(5.0)
    expect(points[0].emf.unit).toBe('V/m')
    expect(typeof points[0].timestamp).toBe('number')
    expect(points[0].timestamp).toBeGreaterThan(0)
    expect((points[0] as unknown as Record<string, unknown>).hdop).toBeUndefined()
    expect((points[0] as unknown as Record<string, unknown>).interpolated).toBeUndefined()

    const loaded = await repo.getSession(meta.id)
    expect(loaded?.metadata.sampleCount).toBe(1)
  })

  it('adds multiple points with correct ordering', async () => {
    const meta = makeSession()
    await repo.initSession(meta.id, meta)

    const pts = [1, 2, 3].map((seq) =>
      makePoint({ sessionId: meta.id, sequenceNumber: seq, timestamp: meta.startedAt + seq * 1000 })
    )
    for (const p of pts) {
      await repo.addPoint(meta.id, p)
    }

    const loaded = await repo.getSession(meta.id)
    expect(loaded?.points).toHaveLength(3)
    expect(loaded?.points.map((p) => p.sequenceNumber)).toEqual([1, 2, 3])
    expect(loaded?.metadata.sampleCount).toBe(3)
  })

  // ── finalizeSession ──────────────────────────────────────────

  it('finalizes session and computes stats', async () => {
    const meta = makeSession({ sampleCount: 3 })
    await repo.initSession(meta.id, meta)

    const pts = [1, 2, 3].map((seq) =>
      makePoint({
        sessionId: meta.id,
        sequenceNumber: seq,
        timestamp: meta.startedAt + seq * 1000,
        correctedMeasurement: seq === 1 ? 3.0 : seq === 2 ? 5.0 : 7.0
      })
    )
    for (const p of pts) {
      await repo.addPoint(meta.id, p)
    }

    await repo.finalizeSession(meta.id, meta)

    const stats = await repo.getSessionStats(meta.id)
    expect(stats).not.toBeNull()
    expect(stats!.pointCount).toBe(3)
    expect(stats!.avgCorrected).toBeCloseTo(5.0, 1)
    expect(stats!.maxCorrected).toBeCloseTo(7.0, 1)
    expect(stats!.minCorrected).toBeCloseTo(3.0, 1)

    const loaded = await repo.getSession(meta.id)
    expect(loaded?.metadata.stoppedAt).toBe(meta.stoppedAt)
    expect(loaded?.metadata.sampleCount).toBe(3)
  })

  // ── Lifecycle: init → addPoints → finalize → get ─────────────

  it('full lifecycle roundtrip preserves all fields', async () => {
    const meta = makeSession({
      label: 'Ruta 9 Norte',
      provincia: 'Neuquén',
      localidad: 'Neuquén',
      apellido1: 'Pérez',
      apellido2: 'Gómez'
    })
    await repo.initSession(meta.id, meta)

    const pts = [1, 2, 3].map((seq) =>
      makePoint({
        sessionId: meta.id,
        sequenceNumber: seq,
        timestamp: meta.startedAt + seq * 1000,
        position: {
          lat: NEUQUEN.lat + seq * 0.001,
          lon: NEUQUEN.lon + seq * 0.001,
          alt: NEUQUEN.alt
        },
        emf: { deviceId: 'nbm550', rawMeasurement: 3.0 + seq, unit: 'V/m' },
        correctedMeasurement: (3.0 + seq) * 1.08
      })
    )
    for (const p of pts) {
      await repo.addPoint(meta.id, p)
    }

    const finalMeta = { ...meta, sampleCount: 3 }
    await repo.finalizeSession(meta.id, finalMeta)

    const session = await repo.getSession(meta.id)
    expect(session).not.toBeNull()
    expect(session!.metadata.label).toBe('Ruta 9 Norte')
    expect(session!.metadata.provincia).toBe('Neuquén')
    expect(session!.metadata.localidad).toBe('Neuquén')
    expect(session!.metadata.apellido1).toBe('Pérez')
    expect(session!.metadata.apellido2).toBe('Gómez')
    expect(session!.metadata.correctionFactor).toBe(1.08)
    expect(session!.metadata.sampleCount).toBe(3)
    expect(session!.points).toHaveLength(3)
    expect(session!.points[0].sequenceNumber).toBe(1)
    expect(session!.points[2].sequenceNumber).toBe(3)
    expect(typeof session!.points[0].timestamp).toBe('number')
    expect(session!.points[0].correctedMeasurement).toBeCloseTo(4.0 * 1.08, 2)
  })

  // ── deleteSession ────────────────────────────────────────────

  it('deletes session and cascades to geo_points and session_stats', async () => {
    const meta = makeSession({ sampleCount: 2 })
    await repo.initSession(meta.id, meta)

    const pts = [1, 2].map((seq) => makePoint({ sessionId: meta.id, sequenceNumber: seq }))
    for (const p of pts) {
      await repo.addPoint(meta.id, p)
    }
    await repo.finalizeSession(meta.id, { ...meta, sampleCount: 2 })

    expect(await repo.getSessionPoints(meta.id)).toHaveLength(2)
    const stats = await repo.getSessionStats(meta.id)
    expect(stats).not.toBeNull()

    await repo.deleteSession(meta.id)

    expect(await repo.getSession(meta.id)).toBeNull()
    expect(await repo.getSessionPoints(meta.id)).toHaveLength(0)
    expect(await repo.getSessionStats(meta.id)).toBeNull()
    expect(await repo.listSessions()).toHaveLength(0)
  })

  // ── listSessions ─────────────────────────────────────────────

  it('lists multiple sessions ordered by startedAt descending', async () => {
    const old = makeSession({ id: uuidv4(), label: 'Old', startedAt: Date.now() - 200000 })
    const mid = makeSession({ id: uuidv4(), label: 'Mid', startedAt: Date.now() - 100000 })
    const recent = makeSession({ id: uuidv4(), label: 'Recent', startedAt: Date.now() })

    await repo.initSession(mid.id, mid)
    await repo.initSession(old.id, old)
    await repo.initSession(recent.id, recent)

    const sessions = await repo.listSessions()
    expect(sessions).toHaveLength(3)
    expect(sessions[0].label).toBe('Recent')
    expect(sessions[1].label).toBe('Mid')
    expect(sessions[2].label).toBe('Old')
  })

  // ── getSession ───────────────────────────────────────────────

  it('returns null for non-existent session', async () => {
    const result = await repo.getSession('nonexistent')
    expect(result).toBeNull()
  })

  // ── getPointsInBounds ────────────────────────────────────────

  it('filters points by bounding box', async () => {
    const meta = makeSession()
    await repo.initSession(meta.id, meta)

    const pts = [
      makePoint({
        sessionId: meta.id,
        sequenceNumber: 1,
        position: { lat: -38.95, lon: -68.06, alt: 270 }
      }),
      makePoint({
        sessionId: meta.id,
        sequenceNumber: 2,
        position: { lat: -38.93, lon: -68.04, alt: 275 }
      }),
      makePoint({
        sessionId: meta.id,
        sequenceNumber: 3,
        position: { lat: -38.9, lon: -68.0, alt: 280 }
      })
    ]
    for (const p of pts) {
      await repo.addPoint(meta.id, p)
    }
    await repo.finalizeSession(meta.id, { ...meta, sampleCount: 3 })

    const inside = await repo.getPointsInBounds(meta.id, -38.94, -38.96, -68.05, -68.07)
    expect(inside).toHaveLength(1)
    expect(inside[0].sequenceNumber).toBe(1)
    expect(typeof inside[0].timestamp).toBe('number')
    expect((inside[0] as unknown as Record<string, unknown>).hdop).toBeUndefined()
    expect((inside[0] as unknown as Record<string, unknown>).interpolated).toBeUndefined()
  })

  // ── getSessionStats ──────────────────────────────────────────

  it('returns null stats when session has no points', async () => {
    const meta = makeSession()
    await repo.initSession(meta.id, meta)
    await repo.finalizeSession(meta.id, { ...meta, sampleCount: 0 })

    const stats = await repo.getSessionStats(meta.id)
    expect(stats).not.toBeNull()
    expect(stats!.pointCount).toBe(0)
    expect(stats!.avgCorrected).toBeNull()
  })

  it('returns null for non-existent session stats', async () => {
    const stats = await repo.getSessionStats('nonexistent')
    expect(stats).toBeNull()
  })

  // ── flush config options ─────────────────────────────────────

  it('accepts custom flush config via constructor', () => {
    const customRepo = new SQLiteSessionRepository({
      testDb: db,
      flushEveryNPoints: 1,
      flushIntervalMs: 1000
    })

    expect((customRepo as unknown as { FLUSH_EVERY_N_POINTS: number }).FLUSH_EVERY_N_POINTS).toBe(1)
    expect((customRepo as unknown as { FLUSH_INTERVAL_MS: number }).FLUSH_INTERVAL_MS).toBe(1000)
    customRepo.close()
  })

  it('rejects addPoint when MAX_EXPORT_POINTS is reached', async () => {
    const meta = makeSession()
    await repo.initSession(meta.id, meta)

    for (let i = 1; i <= SQLiteSessionRepository.MAX_EXPORT_POINTS; i++) {
      await repo.addPoint(meta.id, makePoint({ sessionId: meta.id, sequenceNumber: i }))
    }

    const extraPoint = makePoint({
      sessionId: meta.id,
      sequenceNumber: SQLiteSessionRepository.MAX_EXPORT_POINTS + 1
    })
    await expect(repo.addPoint(meta.id, extraPoint)).rejects.toThrow(/Límite de/)

    const points = await repo.getSessionPoints(meta.id)
    expect(points).toHaveLength(SQLiteSessionRepository.MAX_EXPORT_POINTS)
  })

  it('getSessionPoints respects explicit limit', async () => {
    const meta = makeSession({ sampleCount: 5 })
    await repo.initSession(meta.id, meta)
    for (let i = 1; i <= 5; i++) {
      await repo.addPoint(meta.id, makePoint({ sessionId: meta.id, sequenceNumber: i }))
    }
    await repo.finalizeSession(meta.id, { ...meta, sampleCount: 5 })

    const points = await repo.getSessionPoints(meta.id, 3)
    expect(points).toHaveLength(3)
  })

  it('getSession respects pointLimit', async () => {
    const meta = makeSession({ sampleCount: 5 })
    await repo.initSession(meta.id, meta)
    for (let i = 1; i <= 5; i++) {
      await repo.addPoint(meta.id, makePoint({ sessionId: meta.id, sequenceNumber: i }))
    }
    await repo.finalizeSession(meta.id, { ...meta, sampleCount: 5 })

    const session = await repo.getSession(meta.id, 2)
    expect(session).not.toBeNull()
    expect(session!.points).toHaveLength(2)
  })

  // ── saveSession (transacción completa) ─────────────────────

  it('saveSession persists metadata, points and stats in one shot', async () => {
    const meta = makeSession({ sampleCount: 2 })
    const pts = [1, 2].map((seq) =>
      makePoint({ sessionId: meta.id, sequenceNumber: seq, correctedMeasurement: seq * 2 })
    )
    await repo.saveSession(meta.id, meta, pts)

    const loaded = await repo.getSession(meta.id)
    expect(loaded?.metadata.sampleCount).toBe(2)
    expect(loaded?.points).toHaveLength(2)

    const stats = await repo.getSessionStats(meta.id)
    expect(stats?.pointCount).toBe(2)
    expect(stats?.avgCorrected).toBeCloseTo(3.0, 1)
  })

  it('rolls back point inserts and wraps saveSession errors', async () => {
    const metaA = makeSession()
    const dupPoint = makePoint({ id: 'dup-point', sessionId: metaA.id, sequenceNumber: 1 })
    await repo.saveSession(metaA.id, metaA, [dupPoint])

    const metaB = makeSession()
    await expect(
      repo.saveSession(metaB.id, metaB, [{ ...dupPoint, sessionId: metaB.id }])
    ).rejects.toThrow(/Cannot save session/)
    expect(await repo.getSessionPoints(metaB.id)).toEqual([])
  })

  // ── Manejo de errores ──────────────────────────────────────

  it('rolls back and logs when adding a duplicate point', async () => {
    const meta = makeSession()
    await repo.initSession(meta.id, meta)

    const point = makePoint({ id: 'dup-point-2', sessionId: meta.id, sequenceNumber: 1 })
    await repo.addPoint(meta.id, point)

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await repo.addPoint(meta.id, point)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('wraps initSession errors', async () => {
    const SQL = await initSqlJs()
    const brokenDb = new SQL.Database()
    const brokenRepo = new SQLiteSessionRepository({ testDb: brokenDb })
    brokenDb.close()

    await expect(brokenRepo.initSession('x', makeSession())).rejects.toThrow(
      /Cannot initialize session/
    )
  })

  it('wraps finalizeSession errors', async () => {
    const SQL = await initSqlJs()
    const brokenDb = new SQL.Database()
    const brokenRepo = new SQLiteSessionRepository({ testDb: brokenDb })
    brokenDb.close()

    await expect(brokenRepo.finalizeSession('x', makeSession())).rejects.toThrow(
      /Cannot finalize session/
    )
  })

  it('wraps deleteSession errors', async () => {
    const SQL = await initSqlJs()
    const brokenDb = new SQL.Database()
    const brokenRepo = new SQLiteSessionRepository({ testDb: brokenDb })
    brokenDb.close()

    await expect(brokenRepo.deleteSession('x')).rejects.toThrow(/Cannot delete session/)
  })

  it('returns safe defaults when the database errors in read methods', async () => {
    const SQL = await initSqlJs()
    const brokenDb = new SQL.Database()
    const brokenRepo = new SQLiteSessionRepository({ testDb: brokenDb })
    brokenDb.close()

    expect(await brokenRepo.getSession('x')).toBeNull()
    expect(await brokenRepo.listSessions()).toEqual([])
    expect(await brokenRepo.getSessionPoints('x')).toEqual([])
    expect(await brokenRepo.getSessionStats('x')).toBeNull()
    expect(await brokenRepo.getPointsInBounds('x', 1, -1, 1, -1)).toEqual([])
  })

  // ── Flush periódico ────────────────────────────────────────

  it('periodically flushes pending points', async () => {
    vi.useFakeTimers()
    const meta = makeSession()
    const flushRepo = new SQLiteSessionRepository({
      testDb: db,
      flushEveryNPoints: 100,
      flushIntervalMs: 100
    })
    await flushRepo.initSession(meta.id, meta)
    await flushRepo.addPoint(meta.id, makePoint({ sessionId: meta.id, sequenceNumber: 1 }))

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await vi.advanceTimersByTimeAsync(100)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Periodic flush'))
    expect(logSpy).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(100)
    expect(logSpy).toHaveBeenCalledTimes(1)
    logSpy.mockRestore()

    const priv = flushRepo as unknown as { stopFlushTimer(): void; db: SqlJsDatabase | null }
    priv.stopFlushTimer()
    priv.db = null
    vi.useRealTimers()
  })

  // ── Metadatos opcionales ───────────────────────────────────

  it('handles sessions and points without optional metadata', async () => {
    const minimal = makeSession({
      instrument: undefined,
      correctionFactor: undefined,
      provincia: undefined,
      localidad: undefined,
      apellido1: undefined,
      apellido2: undefined,
      stoppedAt: undefined
    })
    await repo.initSession(minimal.id, minimal)

    const listed = (await repo.listSessions()).find((s) => s.id === minimal.id)
    expect(listed?.stoppedAt).toBeNull()
    expect(listed?.instrument).toBeNull()
    expect(listed?.correctionFactor).toBeNull()

    const loaded = await repo.getSession(minimal.id)
    expect(loaded?.metadata.stoppedAt).toBeNull()
    expect(loaded?.metadata.instrument).toBeNull()
    expect(loaded?.metadata.correctionFactor).toBeNull()

    await repo.addPoint(
      minimal.id,
      makePoint({ sessionId: minimal.id, sequenceNumber: 1, gpsGap: true })
    )
    const points = await repo.getSessionPoints(minimal.id)
    expect(points).toHaveLength(1)
    expect(points[0].gpsGap).toBe(true)

    const inBounds = await repo.getPointsInBounds(minimal.id, -38, -39, -68, -69)
    expect(inBounds).toHaveLength(1)

    await repo.finalizeSession(minimal.id, { ...minimal, sampleCount: 1 })
    const stats = await repo.getSessionStats(minimal.id)
    expect(stats?.pointCount).toBe(1)
  })

  it('saveSession accepts minimal metadata', async () => {
    const minimal = makeSession({
      instrument: undefined,
      correctionFactor: undefined,
      stoppedAt: undefined
    })
    await repo.saveSession(minimal.id, minimal, [makePoint({ sessionId: minimal.id })])

    const loaded = await repo.getSession(minimal.id)
    expect(loaded?.metadata.stoppedAt).toBeNull()
    expect(loaded?.metadata.instrument).toBeNull()
    expect(loaded?.metadata.correctionFactor).toBeNull()
  })

  it('reads legacy points with NULL altitude as zero', async () => {
    const meta = makeSession()
    await repo.initSession(meta.id, meta)
    const priv = repo as unknown as { db: SqlJsDatabase }
    priv.db.run(
      `INSERT INTO geo_points (id, sessionId, sequenceNumber, timestamp, lat, lon, alt, rawMeasurement, correctedMeasurement, unit, gps_gap)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 0)`,
      ['null-alt-point', meta.id, 1, new Date().toISOString(), -38.95, -68.05, 3.2, 3.5, 'V/m']
    )

    const points = await repo.getSessionPoints(meta.id)
    expect(points).toHaveLength(1)
    expect(points[0].position.alt).toBe(0)
  })

  it('treats a missing session row as zero sample count', async () => {
    await repo.addPoint(
      'ghost-session',
      makePoint({ sessionId: 'ghost-session', sequenceNumber: 1 })
    )
    const points = await repo.getSessionPoints('ghost-session')
    expect(points).toHaveLength(1)
  })

  it('ensureDb throws and save no-ops when the database is closed', async () => {
    const bare = new SQLiteSessionRepository({ testDb: db })
    const priv = bare as unknown as { db: SqlJsDatabase | null; flush(): void }
    priv.db = null

    await expect(bare.getSession('x')).rejects.toThrow(/Database not initialized/)
    expect(() => priv.flush()).not.toThrow()
  })
})

describe('SQLiteSessionRepository (real file mode)', () => {
  it('initializes, persists, reloads and closes an encrypted database file', async () => {
    vi.stubEnv('NIR_DB_ENCRYPTION_KEY', 'test-key-real-mode')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nir-repo-real-'))
    const getPathMock = vi.mocked(app.getPath)
    const previous = getPathMock.getMockImplementation()
    getPathMock.mockImplementation(() => path.join(dir, 'userData'))

    try {
      const realRepo = new SQLiteSessionRepository({ flushEveryNPoints: 2, flushIntervalMs: 5000 })
      const [a, b] = await Promise.all([realRepo.listSessions(), realRepo.listSessions()])
      expect(a).toEqual([])
      expect(b).toEqual([])

      const meta = makeSession()
      await realRepo.initSession(meta.id, meta)
      await realRepo.addPoint(meta.id, makePoint({ sessionId: meta.id, sequenceNumber: 1 }))
      await realRepo.addPoint(meta.id, makePoint({ sessionId: meta.id, sequenceNumber: 2 }))
      await realRepo.finalizeSession(meta.id, { ...meta, sampleCount: 2 })

      const filePath = path.join(dir, 'userData', 'sessions.db')
      expect(fs.existsSync(filePath)).toBe(true)
      expect(isEncrypted(fs.readFileSync(filePath))).toBe(true)

      const reloaded = new SQLiteSessionRepository({ flushEveryNPoints: 2 })
      const loaded = await reloaded.getSession(meta.id)
      expect(loaded?.metadata.sampleCount).toBe(2)
      expect(loaded?.points).toHaveLength(2)

      realRepo.close()
      reloaded.close()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      getPathMock.mockImplementation(previous ?? (() => '/tmp/nir-test'))
      vi.unstubAllEnvs()
    }
  })

  it('backs up a corrupted encrypted database and recreates it', async () => {
    vi.stubEnv('NIR_DB_ENCRYPTION_KEY', 'test-key-real-mode')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nir-repo-corrupt-'))
    const getPathMock = vi.mocked(app.getPath)
    const previous = getPathMock.getMockImplementation()
    getPathMock.mockImplementation(() => path.join(dir, 'userData'))

    try {
      const userDataDir = path.join(dir, 'userData')
      fs.mkdirSync(userDataDir, { recursive: true })
      fs.writeFileSync(
        path.join(userDataDir, 'sessions.db'),
        Buffer.concat([Buffer.from('NIDB', 'ascii'), Buffer.from('garbage')])
      )

      const repo = new SQLiteSessionRepository({ flushEveryNPoints: 2 })
      await repo.listSessions()
      repo.close()

      const backups = fs.readdirSync(userDataDir).filter((f) => f.includes('.corrupted.'))
      expect(backups).toHaveLength(1)
      expect(fs.existsSync(path.join(userDataDir, 'sessions.db'))).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      getPathMock.mockImplementation(previous ?? (() => '/tmp/nir-test'))
      vi.unstubAllEnvs()
    }
  })

  it('migrates a legacy plain SQLite database to encryption', async () => {
    vi.stubEnv('NIR_DB_ENCRYPTION_KEY', 'test-key-real-mode')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nir-repo-legacy-'))
    const getPathMock = vi.mocked(app.getPath)
    const previous = getPathMock.getMockImplementation()
    getPathMock.mockImplementation(() => path.join(dir, 'userData'))

    try {
      const userDataDir = path.join(dir, 'userData')
      fs.mkdirSync(userDataDir, { recursive: true })

      const SQL = await initSqlJs()
      const plainDb = new SQL.Database()
      plainDb.run(
        'CREATE TABLE sessions (id TEXT PRIMARY KEY, label TEXT NOT NULL, startedAt TEXT NOT NULL, stoppedAt TEXT, sampleCount INTEGER NOT NULL DEFAULT 0)'
      )
      fs.writeFileSync(path.join(userDataDir, 'sessions.db'), Buffer.from(plainDb.export()))
      plainDb.close()

      const repo = new SQLiteSessionRepository({ flushEveryNPoints: 2 })
      await repo.listSessions()
      expect(isEncrypted(fs.readFileSync(path.join(userDataDir, 'sessions.db')))).toBe(true)

      repo.close()
      repo.close()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      getPathMock.mockImplementation(previous ?? (() => '/tmp/nir-test'))
      vi.unstubAllEnvs()
    }
  })

  it('falls back to APPDATA when Electron paths are unavailable', () => {
    const getPathMock = vi.mocked(app.getPath)
    const previous = getPathMock.getMockImplementation()
    getPathMock.mockImplementationOnce(() => {
      throw new Error('no electron')
    })
    vi.stubEnv('APPDATA', '')

    try {
      const bare = new SQLiteSessionRepository()
      expect((bare as unknown as { dbPath: string }).dbPath).toContain('sessions.db')
    } finally {
      getPathMock.mockImplementation(previous ?? (() => '/tmp/nir-test'))
      vi.unstubAllEnvs()
    }
  })
})
