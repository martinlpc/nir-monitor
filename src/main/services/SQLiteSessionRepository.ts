import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { app } from 'electron'
import type { GeoTimestamp } from '../../shared/GeoTimestamp'
import type { SessionSummary } from '../../shared/ipc.types'
import type {
  ISessionRepository,
  PersistedSession,
  SessionStats
} from '../../shared/services/ISessionRepository'
import { encrypt, decrypt, isEncrypted } from './CryptoService'

/**
 * SQLite-based session persistence using sql.js (WASM)
 * Schema:
 * - sessions: metadata (id, label, startedAt, stoppedAt, sampleCount)
 * - geo_points: individual points (sessionId, position, emf data)
 * - session_stats: pre-calculated statistics (avgCorrected, maxCorrected, etc.)
 */
export class SQLiteSessionRepository implements ISessionRepository {
  static readonly MAX_EXPORT_POINTS = 5000

  private db: SqlJsDatabase | null = null
  private dbPath: string = ''
  private initialized = false
  private initPromise: Promise<void> | null = null
  private pendingPoints = 0
  private flushInterval: ReturnType<typeof setInterval> | null = null
  private readonly FLUSH_EVERY_N_POINTS: number
  private readonly FLUSH_INTERVAL_MS: number
  private readonly isTestMode: boolean

  constructor(options?: {
    testDb?: SqlJsDatabase
    flushEveryNPoints?: number
    flushIntervalMs?: number
  }) {
    this.FLUSH_EVERY_N_POINTS = options?.flushEveryNPoints ?? 5
    this.FLUSH_INTERVAL_MS = options?.flushIntervalMs ?? 5_000

    if (options?.testDb) {
      this.db = options.testDb
      this.isTestMode = true
      return
    }
    this.isTestMode = false
    try {
      const dataPath = app.getPath('userData')
      this.dbPath = path.join(dataPath, 'sessions.db')
    } catch {
      // Fallback cuando no hay Electron (p.ej. en scripts standalone)
      // En Windows, usa AppData\Roaming; en Unix, usa .config
      const dataPath =
        process.platform === 'win32'
          ? path.join(process.env.APPDATA || os.homedir(), 'RNI Monitor')
          : path.join(os.homedir(), '.config', 'RNI Monitor')
      this.dbPath = path.join(dataPath, 'sessions.db')
    }
  }

  /**
   * Convertir Unix timestamp (ms) a formato ISO 8601 legible
   */
  private unixToISO(timestamp: number): string {
    return new Date(timestamp).toISOString()
  }

  /**
   * Convertir ISO 8601 a Unix timestamp (ms)
   */
  private isoToUnix(isoString: string): number {
    return new Date(isoString).getTime()
  }

  /**
   * Mapear una fila de geo_points a GeoTimestamp
   */
  private rowToGeoTimestamp(row: unknown[], columns: string[]): GeoTimestamp {
    const rowMap = Object.fromEntries(columns.map((col, idx) => [col, row[idx]]))
    return {
      id: rowMap.id as string,
      sessionId: rowMap.sessionId as string,
      sequenceNumber: rowMap.sequenceNumber as number,
      timestamp: this.isoToUnix(rowMap.timestamp as string),
      position: {
        lat: rowMap.lat as number,
        lon: rowMap.lon as number,
        alt: (rowMap.alt as number) || 0
      },
      emf: {
        deviceId: 'nbm550',
        rawMeasurement: rowMap.rawMeasurement as number,
        unit: rowMap.unit as 'V/m' | 'A/m' | 'mW/cm^2' | 'W/m^2'
      },
      correctedMeasurement: rowMap.correctedMeasurement as number,
      gpsGap: (rowMap.gps_gap as number) === 1 || undefined
    }
  }

  /**
   * Inicializar base de datos y crear schema
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.isTestMode) {
      this.initialized = true
      return
    }
    if (this.initPromise) return this.initPromise

    this.initPromise = this._initialize()
    try {
      await this.initPromise
    } finally {
      this.initPromise = null
    }
  }

  private async _initialize(): Promise<void> {
    try {
      // Inicializar SQL.js (cargará el WASM automáticamente)
      const SQL = await initSqlJs()

      // Cargar BD existente si existe
      let data: Uint8Array | undefined
      if (!this.isTestMode && fs.existsSync(this.dbPath)) {
        try {
          const raw = fs.readFileSync(this.dbPath)
          if (isEncrypted(raw)) {
            const decrypted = decrypt(raw)
            data = new Uint8Array(decrypted)
          } else {
            // Legacy plain SQLite — migracion automatica a cifrado
            data = new Uint8Array(raw)
          }
        } catch (err) {
          console.error(
            `[SQLiteSessionRepository] Could not read existing database at ${this.dbPath}:`,
            err
          )
          // Backup corrupted DB before creating a fresh one
          try {
            const backupPath = this.dbPath + '.corrupted.' + Date.now()
            fs.renameSync(this.dbPath, backupPath)
            console.warn(`[SQLiteSessionRepository] Corrupted DB moved to ${backupPath}`)
          } catch {
            // ignore backup failure
          }
        }
      }

      this.db = new SQL.Database(data)

      // Crear tablas si no existen
      this.db.run(`
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
        )
      `)
      // Migraciones: agregar columnas si faltan
      try {
        this.db.run('ALTER TABLE sessions ADD COLUMN correctionFactor REAL')
      } catch {
        /* column may already exist */
      }
      try {
        this.db.run('ALTER TABLE sessions ADD COLUMN instrument TEXT')
      } catch {
        /* column may already exist */
      }
      try {
        this.db.run('ALTER TABLE sessions ADD COLUMN provincia TEXT')
      } catch {
        /* column may already exist */
      }
      try {
        this.db.run('ALTER TABLE sessions ADD COLUMN localidad TEXT')
      } catch {
        /* column may already exist */
      }
      try {
        this.db.run('ALTER TABLE sessions ADD COLUMN apellido1 TEXT')
      } catch {
        /* column may already exist */
      }
      try {
        this.db.run('ALTER TABLE sessions ADD COLUMN apellido2 TEXT')
      } catch {
        /* column may already exist */
      }

      this.db.run(`
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
        )
      `)
      try {
        this.db.run('ALTER TABLE geo_points ADD COLUMN gps_gap INTEGER NOT NULL DEFAULT 0')
      } catch {
        /* column may already exist */
      }

      this.db.run(`
        CREATE TABLE IF NOT EXISTS session_stats (
          sessionId TEXT PRIMARY KEY,
          avgCorrected REAL,
          maxCorrected REAL,
          minCorrected REAL,
          pointCount INTEGER,
          computedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Crear índices
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_geo_session_id ON geo_points(sessionId)`)
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_geo_timestamp ON geo_points(timestamp)`)
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_geo_lat_lon ON geo_points(lat, lon)`)

      this.save()
      this.initialized = true
      console.log('[SQLiteSessionRepository] Database initialized:', this.dbPath)
    } catch (err) {
      console.error('[SQLiteSessionRepository] Initialization failed:', err)
      throw new Error(`Cannot initialize SQLite database: ${err}`)
    }
  }

  private ensureDb(): SqlJsDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.')
    }
    return this.db
  }

  /**
   * Guardar BD a archivo
   */
  private save(): void {
    if (!this.db) return
    if (this.isTestMode) return
    try {
      const data = this.db.export()
      const buffer = Buffer.from(data)
      const encrypted = encrypt(buffer)
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true })
      fs.writeFileSync(this.dbPath, encrypted)
    } catch (err) {
      console.error('[SQLiteSessionRepository] Save failed:', err)
    }
  }

  async saveSession(
    sessionId: string,
    metadata: SessionSummary,
    points: GeoTimestamp[]
  ): Promise<void> {
    await this.initialize()
    const db = this.ensureDb()

    try {
      // Guardar metadatos de sesión
      db.run(
        `INSERT INTO sessions (id, label, startedAt, stoppedAt, sampleCount, correctionFactor, instrument)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          sessionId,
          metadata.label,
          this.unixToISO(metadata.startedAt),
          metadata.stoppedAt ? this.unixToISO(metadata.stoppedAt) : null,
          metadata.sampleCount,
          metadata.correctionFactor ?? null,
          metadata.instrument ? JSON.stringify(metadata.instrument) : null
        ]
      )

      // Guardar puntos en una transacción
      db.run('BEGIN')
      try {
        for (const point of points) {
          db.run(
            `INSERT INTO geo_points 
             (id, sessionId, sequenceNumber, timestamp, lat, lon, alt, rawMeasurement, correctedMeasurement, unit, gps_gap)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              point.id,
              point.sessionId,
              point.sequenceNumber,
              this.unixToISO(point.timestamp),
              point.position.lat,
              point.position.lon,
              point.position.alt,
              point.emf.rawMeasurement,
              point.correctedMeasurement,
              point.emf.unit,
              point.gpsGap ? 1 : 0
            ]
          )
        }
        db.run('COMMIT')
      } catch (err) {
        db.run('ROLLBACK')
        throw err
      }

      // Calcular y guardar estadísticas (usando correctedMeasurement)
      const statsResult = db.exec(
        `SELECT
          AVG(correctedMeasurement) as avgCorrected,
          MAX(correctedMeasurement) as maxCorrected,
          MIN(correctedMeasurement) as minCorrected,
          COUNT(*) as pointCount
        FROM geo_points
        WHERE sessionId = ?`,
        [sessionId]
      )

      const stats = statsResult[0]?.values[0]
        ? {
            avgCorrected: statsResult[0].values[0][0] as number | null,
            maxCorrected: statsResult[0].values[0][1] as number | null,
            minCorrected: statsResult[0].values[0][2] as number | null,
            pointCount: statsResult[0].values[0][3] as number
          }
        : { avgCorrected: null, maxCorrected: null, minCorrected: null, pointCount: 0 }

      db.run(
        `INSERT INTO session_stats (sessionId, avgCorrected, maxCorrected, minCorrected, pointCount)
         VALUES (?, ?, ?, ?, ?)`,
        [sessionId, stats.avgCorrected, stats.maxCorrected, stats.minCorrected, stats.pointCount]
      )

      this.save()
      console.log(`[SQLiteSessionRepository] Session ${sessionId} saved: ${points.length} points`)
    } catch (err) {
      console.error(`[SQLiteSessionRepository] Error saving session:`, err)
      throw new Error(`Cannot save session: ${err}`)
    }
  }

  // ── Flujo incremental: initSession → addPoint(s) → finalizeSession ──

  async initSession(sessionId: string, metadata: SessionSummary): Promise<void> {
    await this.initialize()
    const db = this.ensureDb()

    try {
      db.run(
        `INSERT INTO sessions (id, label, startedAt, stoppedAt, sampleCount, correctionFactor, instrument,
         provincia, localidad, apellido1, apellido2)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sessionId,
          metadata.label,
          this.unixToISO(metadata.startedAt),
          null,
          0,
          metadata.correctionFactor ?? null,
          metadata.instrument ? JSON.stringify(metadata.instrument) : null,
          metadata.provincia ?? null,
          metadata.localidad ?? null,
          metadata.apellido1 ?? null,
          metadata.apellido2 ?? null
        ]
      )
      this.save()
      this.pendingPoints = 0
      this.startFlushTimer()
      console.log(`[SQLiteSessionRepository] Session ${sessionId} initialized`)
    } catch (err) {
      console.error(`[SQLiteSessionRepository] Error initializing session:`, err)
      throw new Error(`Cannot initialize session: ${err}`)
    }
  }

  async addPoint(sessionId: string, point: GeoTimestamp): Promise<void> {
    await this.initialize()
    const db = this.ensureDb()

    const row = db.exec(`SELECT sampleCount FROM sessions WHERE id = ?`, [sessionId])
    const sampleCount: number =
      row.length > 0 && row[0].values.length > 0 ? (row[0].values[0][0] as number) : 0

    if (sampleCount >= SQLiteSessionRepository.MAX_EXPORT_POINTS) {
      console.warn(
        `[SQLiteSessionRepository] Session ${sessionId} reached MAX_EXPORT_POINTS (${SQLiteSessionRepository.MAX_EXPORT_POINTS}), rejecting point`
      )
      throw new Error(
        `Límite de ${SQLiteSessionRepository.MAX_EXPORT_POINTS} puntos alcanzado para esta sesión`
      )
    }

    try {
      db.run('BEGIN')

      db.run(
        `INSERT INTO geo_points
         (id, sessionId, sequenceNumber, timestamp, lat, lon, alt, rawMeasurement, correctedMeasurement, unit, gps_gap)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          point.id,
          sessionId,
          point.sequenceNumber,
          this.unixToISO(point.timestamp),
          point.position.lat,
          point.position.lon,
          point.position.alt,
          point.emf.rawMeasurement,
          point.correctedMeasurement,
          point.emf.unit,
          point.gpsGap ? 1 : 0
        ]
      )

      db.run(`UPDATE sessions SET sampleCount = sampleCount + 1 WHERE id = ?`, [sessionId])

      db.run('COMMIT')

      this.pendingPoints++
      if (this.pendingPoints >= this.FLUSH_EVERY_N_POINTS) {
        this.flush()
      }
    } catch (err) {
      try {
        db.run('ROLLBACK')
      } catch {
        /* rollback error ignored */
      }
      console.error(`[SQLiteSessionRepository] Error adding point:`, err)
    }
  }

  async finalizeSession(sessionId: string, metadata: SessionSummary): Promise<void> {
    await this.initialize()
    const db = this.ensureDb()

    try {
      // Actualizar metadatos finales
      db.run(
        `UPDATE sessions SET stoppedAt = ?, sampleCount = ?, correctionFactor = ?,
         instrument = ?, provincia = ?, localidad = ?, apellido1 = ?, apellido2 = ? WHERE id = ?`,
        [
          metadata.stoppedAt ? this.unixToISO(metadata.stoppedAt) : null,
          metadata.sampleCount,
          metadata.correctionFactor ?? null,
          metadata.instrument ? JSON.stringify(metadata.instrument) : null,
          metadata.provincia ?? null,
          metadata.localidad ?? null,
          metadata.apellido1 ?? null,
          metadata.apellido2 ?? null,
          sessionId
        ]
      )

      // Calcular y guardar estadísticas (usando correctedMeasurement)
      const statsResult = db.exec(
        `SELECT
          AVG(correctedMeasurement) as avgCorrected,
          MAX(correctedMeasurement) as maxCorrected,
          MIN(correctedMeasurement) as minCorrected,
          COUNT(*) as pointCount
        FROM geo_points
        WHERE sessionId = ?`,
        [sessionId]
      )

      const stats = statsResult[0]?.values[0]
        ? {
            avgCorrected: statsResult[0].values[0][0] as number | null,
            maxCorrected: statsResult[0].values[0][1] as number | null,
            minCorrected: statsResult[0].values[0][2] as number | null,
            pointCount: statsResult[0].values[0][3] as number
          }
        : { avgCorrected: null, maxCorrected: null, minCorrected: null, pointCount: 0 }

      db.run(
        `INSERT OR REPLACE INTO session_stats (sessionId, avgCorrected, maxCorrected, minCorrected, pointCount)
         VALUES (?, ?, ?, ?, ?)`,
        [sessionId, stats.avgCorrected, stats.maxCorrected, stats.minCorrected, stats.pointCount]
      )

      this.stopFlushTimer()
      this.flush()
      console.log(`[SQLiteSessionRepository] Session ${sessionId} finalized`)
    } catch (err) {
      console.error(`[SQLiteSessionRepository] Error finalizing session:`, err)
      throw new Error(`Cannot finalize session: ${err}`)
    }
  }

  flush(): void {
    this.save()
    this.pendingPoints = 0
  }

  private startFlushTimer(): void {
    this.stopFlushTimer()
    this.flushInterval = setInterval(() => {
      if (this.pendingPoints > 0) {
        console.log(
          `[SQLiteSessionRepository] Periodic flush (${this.pendingPoints} pending points)`
        )
        this.flush()
      }
    }, this.FLUSH_INTERVAL_MS)
  }

  private stopFlushTimer(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
  }

  async getSession(sessionId: string, pointLimit?: number): Promise<PersistedSession | null> {
    await this.initialize()
    const db = this.ensureDb()

    try {
      // Obtener metadatos
      const metadataResult = db.exec('SELECT * FROM sessions WHERE id = ?', [sessionId])

      if (!metadataResult[0] || !metadataResult[0].values[0]) return null

      const metadataRow = metadataResult[0].values[0]
      const columns = metadataResult[0].columns
      const metadataMap = Object.fromEntries(columns.map((col, idx) => [col, metadataRow[idx]]))

      const metadata: SessionSummary = {
        id: metadataMap.id as string,
        label: metadataMap.label as string,
        startedAt: this.isoToUnix(metadataMap.startedAt as string),
        stoppedAt: metadataMap.stoppedAt ? this.isoToUnix(metadataMap.stoppedAt as string) : null,
        sampleCount: metadataMap.sampleCount as number,
        instrument: metadataMap.instrument ? JSON.parse(metadataMap.instrument as string) : null,
        correctionFactor:
          metadataMap.correctionFactor != null ? Number(metadataMap.correctionFactor) : null,
        provincia: metadataMap.provincia as string | undefined,
        localidad: metadataMap.localidad as string | undefined,
        apellido1: metadataMap.apellido1 as string | undefined,
        apellido2: metadataMap.apellido2 as string | undefined
      }

      // Obtener puntos
      let pointsSql = 'SELECT * FROM geo_points WHERE sessionId = ? ORDER BY timestamp ASC'
      const pointsParams: (string | number)[] = [sessionId]
      if (pointLimit !== undefined) {
        pointsSql += ' LIMIT ?'
        pointsParams.push(pointLimit)
      }
      const pointsResult = db.exec(pointsSql, pointsParams)

      const points: GeoTimestamp[] = (pointsResult[0]?.values || []).map((row) =>
        this.rowToGeoTimestamp(row, pointsResult[0].columns)
      )

      return { metadata, points }
    } catch (err) {
      console.error(`[SQLiteSessionRepository] Error loading session:`, err)
      return null
    }
  }

  async listSessions(): Promise<SessionSummary[]> {
    await this.initialize()
    const db = this.ensureDb()

    try {
      const result = db.exec(
        `SELECT id, label, startedAt, stoppedAt, sampleCount, correctionFactor, instrument,
          provincia, localidad, apellido1, apellido2
         FROM sessions
         ORDER BY startedAt DESC`
      )

      if (!result[0]) return []

      return result[0].values.map((row) => {
        const cols = result[0].columns
        const rowMap = Object.fromEntries(cols.map((col, idx) => [col, row[idx]]))
        return {
          id: rowMap.id as string,
          label: rowMap.label as string,
          startedAt: this.isoToUnix(rowMap.startedAt as string),
          stoppedAt: rowMap.stoppedAt ? this.isoToUnix(rowMap.stoppedAt as string) : null,
          sampleCount: rowMap.sampleCount as number,
          instrument: rowMap.instrument ? JSON.parse(rowMap.instrument as string) : null,
          correctionFactor:
            rowMap.correctionFactor != null ? Number(rowMap.correctionFactor) : null,
          provincia: rowMap.provincia as string | undefined,
          localidad: rowMap.localidad as string | undefined,
          apellido1: rowMap.apellido1 as string | undefined,
          apellido2: rowMap.apellido2 as string | undefined
        } as SessionSummary
      })
    } catch (err) {
      console.error('[SQLiteSessionRepository] Error listing sessions:', err)
      return []
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.initialize()
    const db = this.ensureDb()

    try {
      db.run('DELETE FROM geo_points WHERE sessionId = ?', [sessionId])
      db.run('DELETE FROM session_stats WHERE sessionId = ?', [sessionId])
      db.run('DELETE FROM sessions WHERE id = ?', [sessionId])
      this.save()
      console.log(`[SQLiteSessionRepository] Session ${sessionId} deleted`)
    } catch (err) {
      console.error(`[SQLiteSessionRepository] Error deleting session:`, err)
      throw new Error(`Cannot delete session: ${err}`)
    }
  }

  async getSessionPoints(sessionId: string, limit?: number): Promise<GeoTimestamp[]> {
    await this.initialize()
    const db = this.ensureDb()

    try {
      let sql = 'SELECT * FROM geo_points WHERE sessionId = ? ORDER BY timestamp ASC'
      const params: (string | number)[] = [sessionId]
      if (limit !== undefined) {
        sql += ' LIMIT ?'
        params.push(limit)
      }
      const result = db.exec(sql, params)

      if (!result[0]) return []

      return result[0].values.map((row) => this.rowToGeoTimestamp(row, result[0].columns))
    } catch (err) {
      console.error(`[SQLiteSessionRepository] Error loading points:`, err)
      return []
    }
  }

  /**
   * Obtener estadísticas pre-calculadas de sesión
   */
  async getSessionStats(sessionId: string): Promise<SessionStats | null> {
    await this.initialize()
    const db = this.ensureDb()

    try {
      const result = db.exec(
        `SELECT avgCorrected, maxCorrected, minCorrected, pointCount FROM session_stats WHERE sessionId = ?`,
        [sessionId]
      )

      if (!result[0] || !result[0].values[0]) return null

      const row = result[0].values[0]
      const cols = result[0].columns
      const rowMap = Object.fromEntries(cols.map((col, idx) => [col, row[idx]]))

      return {
        avgCorrected: rowMap.avgCorrected as number,
        maxCorrected: rowMap.maxCorrected as number,
        minCorrected: rowMap.minCorrected as number,
        pointCount: rowMap.pointCount as number
      }
    } catch (err) {
      console.error('[SQLiteSessionRepository] Error loading stats:', err)
      return null
    }
  }

  /**
   * Buscar puntos dentro de un bounding box
   */
  async getPointsInBounds(
    sessionId: string,
    north: number,
    south: number,
    east: number,
    west: number
  ): Promise<GeoTimestamp[]> {
    await this.initialize()
    const db = this.ensureDb()

    try {
      const result = db.exec(
        `SELECT * FROM geo_points
         WHERE sessionId = ?
           AND lat >= ? AND lat <= ?
           AND lon >= ? AND lon <= ?
         ORDER BY timestamp ASC`,
        [sessionId, south, north, west, east]
      )

      if (!result[0]) return []

      return result[0].values.map((row) => this.rowToGeoTimestamp(row, result[0].columns))
    } catch (err) {
      console.error('[SQLiteSessionRepository] Error querying bounds:', err)
      return []
    }
  }

  /**
   * Cerrar conexión a base de datos
   */
  close(): void {
    this.stopFlushTimer()
    if (this.db) {
      if (!this.isTestMode) this.save()
      this.db.close()
      this.db = null
      this.initialized = false
      console.log('[SQLiteSessionRepository] Database closed')
    }
  }
}
