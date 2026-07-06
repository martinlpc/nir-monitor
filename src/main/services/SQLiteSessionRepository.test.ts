import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { v4 as uuidv4 } from 'uuid'
import { SQLiteSessionRepository } from './SQLiteSessionRepository'
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

  // ── exportAsGeoJSON ──────────────────────────────────────────

  it('exports as valid GeoJSON FeatureCollection', async () => {
    const meta = makeSession({ sampleCount: 2 })
    await repo.initSession(meta.id, meta)
    for (const seq of [1, 2]) {
      await repo.addPoint(meta.id, makePoint({ sessionId: meta.id, sequenceNumber: seq }))
    }
    await repo.finalizeSession(meta.id, { ...meta, sampleCount: 2 })

    const output = await repo.exportAsGeoJSON(meta.id)
    const parsed = JSON.parse(output)
    expect(parsed.type).toBe('FeatureCollection')
    expect(parsed.features).toHaveLength(2)
    expect(parsed.properties.session.id).toBe(meta.id)
    expect(parsed.properties.session.provincia).toBe('Neuquén')
    expect(parsed.properties.correctionFactor).toBe(1.08)
    expect(parsed.properties.stats.pointCount).toBe(2)
    expect(parsed.features[0].geometry.type).toBe('Point')
    expect(parsed.features[0].geometry.coordinates).toHaveLength(3)
  })

  // ── exportAsCSV ──────────────────────────────────────────────

  it('exports as valid CSV with headers and quoted rows', async () => {
    const meta = makeSession({ sampleCount: 1 })
    await repo.initSession(meta.id, meta)
    await repo.addPoint(meta.id, makePoint({ sessionId: meta.id, sequenceNumber: 1 }))
    await repo.finalizeSession(meta.id, { ...meta, sampleCount: 1 })

    const csv = await repo.exportAsCSV(meta.id)
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('Timestamp')
    expect(lines[0]).toContain('Corrected (V/m)')
    expect(lines[1]).toContain('"')
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

  // ── export limit (MAX_EXPORT_POINTS) ─────────────────────────

  it('does not truncate when points are within limit', async () => {
    const meta = makeSession({ sampleCount: 1 })
    await repo.initSession(meta.id, meta)
    await repo.addPoint(meta.id, makePoint({ sessionId: meta.id, sequenceNumber: 1 }))
    await repo.finalizeSession(meta.id, { ...meta, sampleCount: 1 })

    const geojson = await repo.exportAsGeoJSON(meta.id)
    const parsed = JSON.parse(geojson)
    expect(parsed.features).toHaveLength(1)
  })

  it('truncates GeoJSON export to MAX_EXPORT_POINTS', async () => {
    const manyPoints = SQLiteSessionRepository.MAX_EXPORT_POINTS + 10
    const meta = makeSession({ sampleCount: manyPoints })
    await repo.initSession(meta.id, meta)
    for (let i = 1; i <= SQLiteSessionRepository.MAX_EXPORT_POINTS; i++) {
      await repo.addPoint(meta.id, makePoint({ sessionId: meta.id, sequenceNumber: i }))
    }
    // Insert excess points directly (bypass addPoint limit) to test export truncation
    const extraCount = manyPoints - SQLiteSessionRepository.MAX_EXPORT_POINTS
    const now = new Date().toISOString()
    for (let i = 1; i <= extraCount; i++) {
      const seq = SQLiteSessionRepository.MAX_EXPORT_POINTS + i
      db.run(
        `INSERT INTO geo_points (id, sessionId, sequenceNumber, timestamp, lat, lon, alt, rawMeasurement, correctedMeasurement, unit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), meta.id, seq, now, NEUQUEN.lat, NEUQUEN.lon, NEUQUEN.alt, 5.0, 5.4, 'V/m']
      )
    }
    db.run(`UPDATE sessions SET sampleCount = ? WHERE id = ?`, [manyPoints, meta.id])
    await repo.finalizeSession(meta.id, { ...meta, sampleCount: manyPoints })

    const geojson = await repo.exportAsGeoJSON(meta.id)
    const parsed = JSON.parse(geojson)
    expect(parsed.features.length).toBeLessThanOrEqual(SQLiteSessionRepository.MAX_EXPORT_POINTS)
  })

  it('truncates CSV export to MAX_EXPORT_POINTS', async () => {
    const manyPoints = SQLiteSessionRepository.MAX_EXPORT_POINTS + 5
    const meta = makeSession({ sampleCount: manyPoints })
    await repo.initSession(meta.id, meta)
    for (let i = 1; i <= SQLiteSessionRepository.MAX_EXPORT_POINTS; i++) {
      await repo.addPoint(meta.id, makePoint({ sessionId: meta.id, sequenceNumber: i }))
    }
    // Insert excess points directly (bypass addPoint limit) to test export truncation
    const extraCount = manyPoints - SQLiteSessionRepository.MAX_EXPORT_POINTS
    const now = new Date().toISOString()
    for (let i = 1; i <= extraCount; i++) {
      const seq = SQLiteSessionRepository.MAX_EXPORT_POINTS + i
      db.run(
        `INSERT INTO geo_points (id, sessionId, sequenceNumber, timestamp, lat, lon, alt, rawMeasurement, correctedMeasurement, unit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), meta.id, seq, now, NEUQUEN.lat, NEUQUEN.lon, NEUQUEN.alt, 5.0, 5.4, 'V/m']
      )
    }
    db.run(`UPDATE sessions SET sampleCount = ? WHERE id = ?`, [manyPoints, meta.id])
    await repo.finalizeSession(meta.id, { ...meta, sampleCount: manyPoints })

    const csv = await repo.exportAsCSV(meta.id)
    const lines = csv.trim().split('\n')
    expect(lines.length - 1).toBeLessThanOrEqual(SQLiteSessionRepository.MAX_EXPORT_POINTS)
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
})
