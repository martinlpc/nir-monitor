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
import { MAX_SESSION_POINTS } from '../../shared/config.constants'
import { AppError } from '../../shared/errors/AppError'
import { isEncrypted } from './CryptoService'
import type { CryptoService } from './CryptoService'
import { applySchema } from '../db/SchemaManager'
import { PointJournal } from '../db/PointJournal'
import { writeFileAtomic } from '../db/atomicWrite'
import {
  rowToGeoTimestamp,
  rowToSessionSummary,
  rowToSessionStats,
  unixToISO
} from '../db/rowMappers'

export interface RecoveryReport {
  /** Puntos que estaban solo en el journal y se reincorporaron a la base */
  replayedPoints: number
  /** Sesiones que quedaron abiertas por un cierre inesperado y se cerraron */
  closedSessions: number
  /** Bytes descartados al final del journal (registro cortado por el apagón) */
  discardedBytes: number
}

/**
 * SQLite-based session persistence using sql.js (WASM)
 * Schema:
 * - sessions: metadata (id, label, startedAt, stoppedAt, sampleCount)
 * - geo_points: individual points (sessionId, position, emf data)
 * - session_stats: pre-calculated statistics (avgCorrected, maxCorrected, etc.)
 *
 * Durabilidad: la base vive en memoria y se vuelca entera a disco de forma
 * atómica (`save`). Entre volcados, cada punto queda resguardado en un journal
 * append-only con fsync (`PointJournal`), que se reproduce al arrancar.
 */
export class SQLiteSessionRepository implements ISessionRepository {
  static readonly MAX_EXPORT_POINTS = MAX_SESSION_POINTS

  private db: SqlJsDatabase | null = null
  private dbPath: string = ''
  private initialized = false
  private initPromise: Promise<void> | null = null
  private pendingPoints = 0
  private flushInterval: ReturnType<typeof setInterval> | null = null
  private readonly FLUSH_EVERY_N_POINTS: number
  private readonly FLUSH_INTERVAL_MS: number
  private readonly isTestMode: boolean
  private readonly crypto: CryptoService | null
  private readonly journal: PointJournal | null
  private lastRecovery: RecoveryReport | null = null

  constructor(options?: {
    testDb?: SqlJsDatabase
    flushEveryNPoints?: number
    flushIntervalMs?: number
    crypto?: CryptoService
    journal?: PointJournal
  }) {
    this.FLUSH_EVERY_N_POINTS = options?.flushEveryNPoints ?? 25
    this.FLUSH_INTERVAL_MS = options?.flushIntervalMs ?? 30_000
    this.crypto = options?.crypto ?? null

    if (options?.testDb) {
      this.db = options.testDb
      this.isTestMode = true
      this.journal = options.journal ?? null
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
    this.journal =
      options?.journal ??
      new PointJournal(path.join(path.dirname(this.dbPath), 'sessions.journal'), this.crypto)
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
          if (this.crypto && isEncrypted(raw)) {
            const decrypted = this.crypto.decrypt(raw)
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

      // Crear tablas, migraciones e índices
      applySchema(this.db)

      // Reincorporar puntos del journal y cerrar sesiones interrumpidas
      this.lastRecovery = this.recoverFromUncleanShutdown(this.db)

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
   * Volcar la BD completa a disco de forma atómica y vaciar el journal.
   * Lanza si la escritura falla: el llamador decide cómo informarlo.
   */
  private save(): void {
    if (!this.db) return
    if (this.isTestMode) return
    const data = this.db.export()
    const buffer = Buffer.from(data)
    const encrypted = this.crypto ? this.crypto.encrypt(buffer) : buffer
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true })
    writeFileAtomic(this.dbPath, encrypted)
    // El volcado ya contiene todos los puntos: el journal deja de ser necesario
    this.journal?.clear()
  }

  /** Volcado que no debe interrumpir la captura: el journal ya resguarda los puntos. */
  private flushQuietly(context: string): void {
    try {
      this.flush()
    } catch (err) {
      console.error(`[SQLiteSessionRepository] ${context} failed, points remain in journal:`, err)
    }
  }

  // ── Helpers de escritura ─────────────────────────────────────

  private insertPoint(
    db: SqlJsDatabase,
    sessionId: string,
    point: GeoTimestamp,
    ignoreDuplicates = false
  ): void {
    db.run(
      `INSERT ${ignoreDuplicates ? 'OR IGNORE ' : ''}INTO geo_points
       (id, sessionId, sequenceNumber, timestamp, lat, lon, alt, rawMeasurement, correctedMeasurement, unit, gps_gap)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        point.id,
        sessionId,
        point.sequenceNumber,
        unixToISO(point.timestamp),
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

  /** Calcula y guarda las estadísticas de la sesión (usando correctedMeasurement) */
  private storeStats(db: SqlJsDatabase, sessionId: string): void {
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

    const row = statsResult[0]?.values[0]
    const stats = row
      ? {
          avgCorrected: row[0] as number | null,
          maxCorrected: row[1] as number | null,
          minCorrected: row[2] as number | null,
          pointCount: row[3] as number
        }
      : { avgCorrected: null, maxCorrected: null, minCorrected: null, pointCount: 0 }

    db.run(
      `INSERT OR REPLACE INTO session_stats (sessionId, avgCorrected, maxCorrected, minCorrected, pointCount)
       VALUES (?, ?, ?, ?, ?)`,
      [sessionId, stats.avgCorrected, stats.maxCorrected, stats.minCorrected, stats.pointCount]
    )
  }

  // ── Recuperación tras cierre inesperado ──────────────────────

  /**
   * Se ejecuta una vez al abrir la base, antes de que pueda existir una sesión
   * en curso. Reincorpora los puntos que quedaron solo en el journal y cierra
   * las sesiones sin fecha de fin, para que se puedan ver y exportar.
   */
  private recoverFromUncleanShutdown(db: SqlJsDatabase): RecoveryReport {
    const { entries, discardedBytes } = this.journal?.readAll() ?? {
      entries: [],
      discardedBytes: 0
    }
    let replayedPoints = 0

    if (entries.length > 0) {
      const knownSessions = new Map<string, boolean>()
      const sessionExists = (sessionId: string): boolean => {
        let known = knownSessions.get(sessionId)
        if (known === undefined) {
          const res = db.exec('SELECT 1 FROM sessions WHERE id = ?', [sessionId])
          known = res.length > 0 && res[0].values.length > 0
          knownSessions.set(sessionId, known)
        }
        return known
      }

      db.run('BEGIN')
      try {
        for (const entry of entries) {
          if (!sessionExists(entry.sessionId)) continue
          try {
            this.insertPoint(db, entry.sessionId, entry.point, true)
            replayedPoints += db.getRowsModified()
          } catch (err) {
            console.warn('[SQLiteSessionRepository] Skipping unreadable journal entry:', err)
          }
        }
        db.run('COMMIT')
      } catch (err) {
        db.run('ROLLBACK')
        throw err
      }
    }

    const openSessions = db.exec('SELECT id FROM sessions WHERE stoppedAt IS NULL')
    const openIds = (openSessions[0]?.values ?? []).map((row) => row[0] as string)
    for (const sessionId of openIds) {
      db.run(
        `UPDATE sessions SET
           stoppedAt = COALESCE(
             (SELECT MAX(timestamp) FROM geo_points WHERE sessionId = ?), startedAt),
           sampleCount = (SELECT COUNT(*) FROM geo_points WHERE sessionId = ?)
         WHERE id = ?`,
        [sessionId, sessionId, sessionId]
      )
      this.storeStats(db, sessionId)
    }

    if (replayedPoints > 0 || openIds.length > 0 || discardedBytes > 0) {
      console.warn(
        `[SQLiteSessionRepository] Recovery after unclean shutdown: ${replayedPoints} point(s) restored from journal, ${openIds.length} session(s) closed, ${discardedBytes} byte(s) discarded`
      )
    }

    return { replayedPoints, closedSessions: openIds.length, discardedBytes }
  }

  /** Resultado de la recuperación hecha al abrir la base (null si aún no se abrió). */
  getLastRecovery(): RecoveryReport | null {
    return this.lastRecovery
  }

  async saveSession(
    sessionId: string,
    metadata: SessionSummary,
    points: GeoTimestamp[]
  ): Promise<void> {
    await this.initialize()
    const db = this.ensureDb()

    // Todo en una transacción: ante cualquier error no queda una sesión a medias
    db.run('BEGIN')
    try {
      db.run(
        `INSERT INTO sessions (id, label, startedAt, stoppedAt, sampleCount, correctionFactor, instrument,
         provincia, localidad, apellido1, apellido2)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sessionId,
          metadata.label,
          unixToISO(metadata.startedAt),
          metadata.stoppedAt ? unixToISO(metadata.stoppedAt) : null,
          metadata.sampleCount,
          metadata.correctionFactor ?? null,
          metadata.instrument ? JSON.stringify(metadata.instrument) : null,
          metadata.provincia ?? null,
          metadata.localidad ?? null,
          metadata.apellido1 ?? null,
          metadata.apellido2 ?? null
        ]
      )

      for (const point of points) {
        this.insertPoint(db, sessionId, point)
      }

      this.storeStats(db, sessionId)
      db.run('COMMIT')
    } catch (err) {
      try {
        db.run('ROLLBACK')
      } catch {
        /* rollback error ignored */
      }
      console.error(`[SQLiteSessionRepository] Error saving session:`, err)
      throw new Error(`Cannot save session: ${err}`)
    }

    try {
      this.save()
    } catch (err) {
      // No se pudo escribir a disco: se deshace en memoria para no mostrar una
      // sesión que desaparecería al reiniciar
      db.run('DELETE FROM geo_points WHERE sessionId = ?', [sessionId])
      db.run('DELETE FROM session_stats WHERE sessionId = ?', [sessionId])
      db.run('DELETE FROM sessions WHERE id = ?', [sessionId])
      console.error(`[SQLiteSessionRepository] Error persisting session:`, err)
      throw new Error(`Cannot save session: ${err}`)
    }
    console.log(`[SQLiteSessionRepository] Session ${sessionId} saved: ${points.length} points`)
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
          unixToISO(metadata.startedAt),
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
      // La fila de la sesión debe estar en disco antes del primer punto:
      // el journal solo reincorpora puntos de sesiones que existen en la base.
      this.save()
      this.pendingPoints = 0
      this.startFlushTimer()
      console.log(`[SQLiteSessionRepository] Session ${sessionId} initialized`)
    } catch (err) {
      console.error(`[SQLiteSessionRepository] Error initializing session:`, err)
      throw new Error(`Cannot initialize session: ${err}`)
    }
  }

  /**
   * Agrega un punto. Cuando la promesa resuelve, el punto está en el journal
   * forzado a disco. Lanza si no se pudo resguardar o insertar.
   */
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
      throw new AppError({
        code: 'SESSION_POINT_LIMIT',
        message: `Límite de ${SQLiteSessionRepository.MAX_EXPORT_POINTS} puntos alcanzado para esta sesión`,
        severity: 'warning',
        category: 'session',
        userAction: 'Inicie una nueva sesión para continuar midiendo',
        retryable: false
      })
    }

    // Primero al journal: si la app muere después de esta línea, el punto se
    // reincorpora al arrancar aunque nunca haya llegado al volcado completo.
    this.journal?.append(sessionId, point)

    try {
      db.run('BEGIN')
      this.insertPoint(db, sessionId, point)
      db.run(`UPDATE sessions SET sampleCount = sampleCount + 1 WHERE id = ?`, [sessionId])
      db.run('COMMIT')
    } catch (err) {
      try {
        db.run('ROLLBACK')
      } catch {
        /* rollback error ignored */
      }
      console.error(`[SQLiteSessionRepository] Error adding point:`, err)
      throw new Error(`Cannot add point: ${err}`)
    }

    this.pendingPoints++
    if (this.pendingPoints >= this.FLUSH_EVERY_N_POINTS) {
      this.flushQuietly('Flush after N points')
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
          metadata.stoppedAt ? unixToISO(metadata.stoppedAt) : null,
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

      this.storeStats(db, sessionId)

      this.stopFlushTimer()
      this.flush()
      console.log(`[SQLiteSessionRepository] Session ${sessionId} finalized`)
    } catch (err) {
      console.error(`[SQLiteSessionRepository] Error finalizing session:`, err)
      throw new Error(`Cannot finalize session: ${err}`)
    }
  }

  /** Vuelca la base a disco. Lanza si la escritura falla. */
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
        this.flushQuietly('Periodic flush')
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

      const metadata = rowToSessionSummary(metadataRow, columns)

      // Obtener puntos
      let pointsSql = 'SELECT * FROM geo_points WHERE sessionId = ? ORDER BY timestamp ASC'
      const pointsParams: (string | number)[] = [sessionId]
      if (pointLimit !== undefined) {
        pointsSql += ' LIMIT ?'
        pointsParams.push(pointLimit)
      }
      const pointsResult = db.exec(pointsSql, pointsParams)

      const points: GeoTimestamp[] = (pointsResult[0]?.values || []).map((row) =>
        rowToGeoTimestamp(row, pointsResult[0].columns)
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

      return result[0].values.map((row) => rowToSessionSummary(row, result[0].columns))
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

      return result[0].values.map((row) => rowToGeoTimestamp(row, result[0].columns))
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

      return rowToSessionStats(row, result[0].columns)
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

      return result[0].values.map((row) => rowToGeoTimestamp(row, result[0].columns))
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
      if (!this.isTestMode) {
        try {
          this.save()
        } catch (err) {
          console.error('[SQLiteSessionRepository] Save on close failed:', err)
        }
      }
      this.db.close()
      this.db = null
      this.initialized = false
      console.log('[SQLiteSessionRepository] Database closed')
    }
    this.journal?.close()
  }
}
