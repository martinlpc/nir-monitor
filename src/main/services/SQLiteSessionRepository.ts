import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import ExcelJS from 'exceljs'
import archiver from 'archiver'
import { PassThrough } from 'stream'
import type { GeoTimestamp } from '../../shared/GeoTimestamp'
import type { SessionSummary } from '../../shared/ipc.types'
import type {
  ISessionRepository,
  PersistedSession,
  SessionStats
} from '../../shared/services/ISessionRepository'
import { encrypt, decrypt, isEncrypted } from './CryptoService'
import { electricFieldToMepPercent } from '../../shared/emfConversion'

/**
 * SQLite-based session persistence using sql.js (WASM)
 * Schema:
 * - sessions: metadata (id, label, startedAt, stoppedAt, sampleCount)
 * - geo_points: individual points (sessionId, position, emf data)
 * - session_stats: pre-calculated statistics (avgCorrected, maxCorrected, etc.)
 */
export class SQLiteSessionRepository implements ISessionRepository {
  private db: SqlJsDatabase | null = null
  private dbPath: string = ''
  private initialized = false
  private initPromise: Promise<void> | null = null
  private pendingPoints = 0
  private flushInterval: ReturnType<typeof setInterval> | null = null
  private readonly FLUSH_EVERY_N_POINTS = 10
  private readonly FLUSH_INTERVAL_MS = 30_000
  private readonly isTestMode: boolean

  constructor(options?: { testDb?: SqlJsDatabase }) {
    if (options?.testDb) {
      this.db = options.testDb
      this.isTestMode = true
      return
    }
    this.isTestMode = false
    try {
      const dataPath = app.getPath('userData')
      this.dbPath = path.join(dataPath, 'sessions.db')
    } catch (err) {
      // Fallback cuando no hay Electron (p.ej. en scripts standalone)
      // En Windows, usa AppData\Roaming; en Unix, usa .config
      const os = require('os')
      const dataPath =
        process.platform === 'win32'
          ? path.join(process.env.APPDATA || os.homedir(), 'nir-monitor')
          : path.join(os.homedir(), '.config', 'nir-monitor')
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
          console.warn('[SQLiteSessionRepository] Could not read existing database:', err)
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
      } catch (e) {}
      try {
        this.db.run('ALTER TABLE sessions ADD COLUMN instrument TEXT')
      } catch (e) {}
      try {
        this.db.run('ALTER TABLE sessions ADD COLUMN provincia TEXT')
      } catch (e) {}
      try {
        this.db.run('ALTER TABLE sessions ADD COLUMN localidad TEXT')
      } catch (e) {}
      try {
        this.db.run('ALTER TABLE sessions ADD COLUMN apellido1 TEXT')
      } catch (e) {}
      try {
        this.db.run('ALTER TABLE sessions ADD COLUMN apellido2 TEXT')
      } catch (e) {}

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
          unit TEXT NOT NULL
        )
      `)

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

      // Guardar puntos
      for (const point of points) {
        db.run(
          `INSERT INTO geo_points 
           (id, sessionId, sequenceNumber, timestamp, lat, lon, alt, rawMeasurement, correctedMeasurement, unit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            point.emf.unit
          ]
        )
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

    try {
      db.run(
        `INSERT INTO geo_points
         (id, sessionId, sequenceNumber, timestamp, lat, lon, alt, rawMeasurement, correctedMeasurement, unit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          point.emf.unit
        ]
      )

      // Actualizar sampleCount en sessions
      db.run(`UPDATE sessions SET sampleCount = sampleCount + 1 WHERE id = ?`, [sessionId])

      this.pendingPoints++
      if (this.pendingPoints >= this.FLUSH_EVERY_N_POINTS) {
        this.flush()
      }
    } catch (err) {
      console.error(`[SQLiteSessionRepository] Error adding point:`, err)
      // No throw - continuar capturando aunque falle la persistencia de un punto
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

  async getSession(sessionId: string): Promise<PersistedSession | null> {
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
      const pointsResult = db.exec(
        'SELECT * FROM geo_points WHERE sessionId = ? ORDER BY timestamp ASC',
        [sessionId]
      )

      const points: GeoTimestamp[] = (pointsResult[0]?.values || []).map((row) => {
        const cols = pointsResult[0].columns
        const rowMap = Object.fromEntries(cols.map((col, idx) => [col, row[idx]]))
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
          correctedMeasurement: rowMap.correctedMeasurement as number
        }
      })

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

  async getSessionPoints(sessionId: string): Promise<GeoTimestamp[]> {
    await this.initialize()
    const db = this.ensureDb()

    try {
      const result = db.exec(
        'SELECT * FROM geo_points WHERE sessionId = ? ORDER BY timestamp ASC',
        [sessionId]
      )

      if (!result[0]) return []

      return result[0].values.map((row) => {
        const cols = result[0].columns
        const rowMap = Object.fromEntries(cols.map((col, idx) => [col, row[idx]]))
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
          correctedMeasurement: rowMap.correctedMeasurement as number
        }
      })
    } catch (err) {
      console.error(`[SQLiteSessionRepository] Error loading points:`, err)
      return []
    }
  }

  async exportAsGeoJSON(sessionId: string): Promise<string> {
    const points = await this.getSessionPoints(sessionId)
    const session = await this.getSession(sessionId)
    const stats = await this.getSessionStats(sessionId)

    const correctionFactor = session?.metadata.correctionFactor ?? null

    const features = points.map((point) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [point.position.lon, point.position.lat, point.position.alt]
      },
      properties: {
        id: point.id,
        sequenceNumber: point.sequenceNumber,
        timestamp: point.timestamp,
        datetime: new Date(point.timestamp).toISOString(),
        rawMeasurement: point.emf.rawMeasurement,
        correctedMeasurement: point.correctedMeasurement,
        unit: point.emf.unit
      }
    }))

    const instrument = session?.metadata.instrument ?? null

    const geojson = {
      type: 'FeatureCollection' as const,
      properties: {
        session: {
          id: session?.metadata.id ?? sessionId,
          provincia: session?.metadata.provincia ?? null,
          localidad: session?.metadata.localidad ?? null,
          apellido1: session?.metadata.apellido1 ?? null,
          apellido2: session?.metadata.apellido2 ?? null,
          startedAt: session?.metadata.startedAt
            ? new Date(session.metadata.startedAt).toISOString()
            : null,
          sampleCount: session?.metadata.sampleCount ?? points.length
        },
        instrument: {
          meter: {
            brand: instrument?.meter.brand ?? null,
            model: instrument?.meter.model ?? null,
            serial: instrument?.meter.serial ?? null,
            lastCalibrationDate: instrument?.meter.lastCalibrationDate ?? null
          },
          probe: {
            brand: instrument?.probe.brand ?? null,
            model: instrument?.probe.model ?? null,
            serial: instrument?.probe.serial ?? null
          }
        },
        correctionFactor: correctionFactor,
        stats: stats
          ? {
              avgCorrected: stats.avgCorrected,
              maxCorrected: stats.maxCorrected,
              minCorrected: stats.minCorrected,
              pointCount: stats.pointCount
            }
          : null
      },
      features
    }

    return JSON.stringify(geojson, null, 2)
  }

  async exportAsCSV(sessionId: string): Promise<string> {
    const points = await this.getSessionPoints(sessionId)

    const headers = [
      'Timestamp',
      'Sequence#',
      'Latitude',
      'Longitude',
      'Altitude (m)',
      'Raw (V/m)',
      'Corrected (V/m)',
      'Unit'
    ]

    const rows = points.map((point) => [
      new Date(point.timestamp).toISOString(),
      point.sequenceNumber,
      point.position.lat.toFixed(8),
      point.position.lon.toFixed(8),
      point.position.alt?.toFixed(2) || 'N/A',
      point.emf.rawMeasurement.toFixed(2),
      point.correctedMeasurement.toFixed(2),
      point.emf.unit
    ])

    const csv = [headers, ...rows].map((row) => '"' + row.join('","') + '"').join('\n')
    return csv
  }

  async exportAsXLSX(sessionId: string): Promise<Buffer> {
    const session = await this.getSession(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    const { metadata, points } = session
    const stats = await this.getSessionStats(sessionId)

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'NIR Monitor'
    workbook.created = new Date()

    // ── Hoja 1: Resumen ──
    const summarySheet = workbook.addWorksheet('Resumen')

    const headerStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
      alignment: { horizontal: 'left' }
    }

    summarySheet.columns = [
      { header: 'Campo', key: 'field', width: 25 },
      { header: 'Valor', key: 'value', width: 40 }
    ]
    summarySheet.getRow(1).eachCell((cell) => {
      cell.style = headerStyle
    })

    const durationMs = metadata.stoppedAt ? metadata.stoppedAt - metadata.startedAt : 0
    const durationMin = (durationMs / 60000).toFixed(1)

    const instrument = metadata.instrument
    const correctionFactor = metadata.correctionFactor

    summarySheet.addRows([
      { field: 'Etiqueta', value: metadata.label },
      { field: 'ID de sesión', value: metadata.id },
      { field: 'Inicio', value: new Date(metadata.startedAt).toLocaleString('es-AR') },
      {
        field: 'Fin',
        value: metadata.stoppedAt ? new Date(metadata.stoppedAt).toLocaleString('es-AR') : 'N/A'
      },
      { field: 'Duración (min)', value: durationMin },
      { field: 'Cantidad de puntos', value: metadata.sampleCount },
      { field: '', value: '' },
      { field: 'Medidor - Marca', value: instrument?.meter.brand ?? '' },
      { field: 'Medidor - Modelo', value: instrument?.meter.model ?? '' },
      { field: 'Medidor - Nro. de serie', value: instrument?.meter.serial ?? '' },
      { field: 'Medidor - Última calibración', value: instrument?.meter.lastCalibrationDate ?? '' },
      { field: '', value: '' },
      { field: 'Sonda - Marca', value: instrument?.probe.brand ?? '' },
      { field: 'Sonda - Modelo', value: instrument?.probe.model ?? '' },
      { field: 'Sonda - Nro. de serie', value: instrument?.probe.serial ?? '' },
      { field: '', value: '' },
      {
        field: 'Factor de corrección aplicado',
        value: correctionFactor != null ? correctionFactor : 'N/A'
      },
      { field: '', value: '' },
      { field: 'Promedio corregido', value: stats?.avgCorrected?.toFixed(2) ?? 'N/A' },
      { field: 'Máximo corregido', value: stats?.maxCorrected?.toFixed(2) ?? 'N/A' },
      { field: 'Mínimo corregido', value: stats?.minCorrected?.toFixed(2) ?? 'N/A' }
    ])

    // ── Hoja 2: Datos ──
    const dataSheet = workbook.addWorksheet('Datos')

    dataSheet.columns = [
      { header: 'Seq#', key: 'sequenceNumber', width: 6 },
      { header: 'Fecha/Hora', key: 'datetime', width: 22 },
      { header: 'Latitud', key: 'lat', width: 14 },
      { header: 'Longitud', key: 'lon', width: 14 },
      { header: 'Altitud (m)', key: 'alt', width: 12 },
      { header: 'Raw (V/m)', key: 'rawMeasurement', width: 14 },
      { header: 'Corrected (V/m)', key: 'correctedMeasurement', width: 18 },
      { header: 'Unidad', key: 'unit', width: 12 }
    ]
    dataSheet.getRow(1).eachCell((cell) => {
      cell.style = headerStyle
    })

    points.forEach((point) => {
      dataSheet.addRow({
        sequenceNumber: point.sequenceNumber,
        datetime: new Date(point.timestamp).toLocaleString('es-AR'),
        lat: point.position.lat,
        lon: point.position.lon,
        alt: point.position.alt ?? 0,
        rawMeasurement: point.emf.rawMeasurement.toFixed(2),
        correctedMeasurement: point.correctedMeasurement.toFixed(2),
        unit: point.emf.unit
      })
    })

    // Auto-filtro en hoja de datos
    dataSheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: points.length + 1, column: 8 }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer)
  }

  async exportAsKMZ(sessionId: string): Promise<Buffer> {
    const session = await this.getSession(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    const { metadata, points } = session

    // Generar KML
    const kml = this.buildKML(metadata, points)

    // Comprimir a KMZ (ZIP con doc.kml)
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const passthrough = new PassThrough()
      passthrough.on('data', (chunk: Buffer) => chunks.push(chunk))
      passthrough.on('end', () => resolve(Buffer.concat(chunks)))
      passthrough.on('error', reject)

      const archive = archiver('zip', { zlib: { level: 9 } })
      archive.on('error', reject)
      archive.pipe(passthrough)
      archive.append(kml, { name: 'doc.kml' })
      archive.finalize()
    })
  }

  private buildKML(
    metadata: SessionSummary,
    points: GeoTimestamp[]
  ): string {
    const escXml = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const esc = (s: string | null | undefined): string => escXml(s ?? '')

    // Colores fijos por umbral de % MEP (coincide con intensityPalette.ts en renderer)
    const INTENSITY_LEVELS: { maxPercent: number; hex: string }[] = [
      { maxPercent: 1, hex: '#73C2FB' },
      { maxPercent: 2, hex: '#1E90FF' },
      { maxPercent: 4, hex: '#2A52BE' },
      { maxPercent: 8, hex: '#90EE90' },
      { maxPercent: 15, hex: '#32CD32' },
      { maxPercent: 20, hex: '#008000' },
      { maxPercent: 35, hex: '#FFDF00' },
      { maxPercent: 50, hex: '#FFA500' },
      { maxPercent: 250, hex: '#FF4500' }
    ]
    const OVER_100_HEX = '#FF0000'

    const hexToKmlColor = (hex: string, alpha = '7f'): string => {
      const r = hex.slice(1, 3)
      const g = hex.slice(3, 5)
      const b = hex.slice(5, 7)
      return `${alpha}${b}${g}${r}`
    }

    const pointToHex = (valueVm: number): string => {
      const percent = electricFieldToMepPercent(valueVm)
      for (const level of INTENSITY_LEVELS) {
        if (percent <= level.maxPercent) return level.hex
      }
      return OVER_100_HEX
    }

    // Recolectar colores únicos de puntos y segmentos
    const pointColors = points.map((p) => pointToHex(p.correctedMeasurement))
    const segColors: string[] = []
    for (let i = 0; i < points.length - 1; i++) {
      segColors.push(pointToHex(points[i].correctedMeasurement))
    }
    const allUniqueHex = [...new Set([...pointColors, ...segColors])]

    const iconStyles = allUniqueHex
      .map((hex, i) => {
        const kmlColor = hexToKmlColor(hex)
        return `
    <Style id="icon_${i}">
      <IconStyle>
        <color>${kmlColor}</color>
        <scale>1.2</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
      </IconStyle>
    </Style>`
      })
      .join('')

    const segStyles = allUniqueHex
      .map((hex, i) => {
        const kmlColor = hexToKmlColor(hex)
        return `
    <Style id="seg_${i}">
      <LineStyle><color>${kmlColor}</color><width>3</width></LineStyle>
    </Style>`
      })
      .join('')

    const hexToStyleId = (hex: string, prefix: string): string =>
      `${prefix}_${allUniqueHex.indexOf(hex)}`

    // Puntos de medición con nuevo formato de descripción
    const pointPlacemarks = points
      .map((p) => {
        const hex = pointToHex(p.correctedMeasurement)
        const fecha = new Date(p.timestamp).toLocaleDateString('es-AR')
        const hora = new Date(p.timestamp).toLocaleTimeString('es-AR')
        const mepPct = electricFieldToMepPercent(p.correctedMeasurement)
        const rssU = metadata.correctionFactor != null ? p.correctedMeasurement.toFixed(2) : ''
        return `
    <Placemark>
      <description>Fecha: ${esc(fecha)}
Hora: ${esc(hora)}
Valor corregido: ${p.correctedMeasurement.toFixed(2)} V/m
% MEP: ${mepPct.toFixed(1)}%</description>
      <styleUrl>#${hexToStyleId(hex, 'icon')}</styleUrl>
      <TimeStamp><when>${new Date(p.timestamp).toISOString()}</when></TimeStamp>
      <Point><coordinates>${p.position.lon},${p.position.lat},${p.position.alt ?? 0}</coordinates></Point>
      <ExtendedData>
        <Data name="rawMeasurement"><value>${p.emf.rawMeasurement}</value></Data>
        <Data name="correctedMeasurement"><value>${rssU}</value></Data>
        <Data name="unit"><value>${esc(p.emf.unit)}</value></Data>
      </ExtendedData>
    </Placemark>`
      })
      .join('')

    // Segmentos coloreados entre pares consecutivos (como en el mapa de la app)
    const segmentPlacemarks = points.length < 2 ? '' : points
      .slice(0, -1)
      .map((p, i) => {
        const next = points[i + 1]
        const hex = pointToHex(p.correctedMeasurement)
        return `
    <Placemark>
      <styleUrl>#${hexToStyleId(hex, 'seg')}</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${p.position.lon},${p.position.lat},${p.position.alt ?? 0} ${next.position.lon},${next.position.lat},${next.position.alt ?? 0}</coordinates>
      </LineString>
    </Placemark>`
      })
      .join('')

    const startDate = new Date(metadata.startedAt).toLocaleString('es-AR')
    const endDate = metadata.stoppedAt
      ? new Date(metadata.stoppedAt).toLocaleString('es-AR')
      : 'N/A'

    const inst = metadata.instrument
    const instrumentDesc = inst
      ? `\nMedidor: ${esc(inst.meter.brand)} ${esc(inst.meter.model)} (S/N: ${esc(inst.meter.serial)})` +
        `\nÚltima calibración: ${esc(inst.meter.lastCalibrationDate)}` +
        `\nSonda: ${esc(inst.probe.brand)} ${esc(inst.probe.model)} (S/N: ${esc(inst.probe.serial)})` +
        `\nFactor de corrección: ${metadata.correctionFactor ?? 'N/A'}`
      : ''

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escXml(metadata.label)}</name>
  <description>Sesión: ${escXml(metadata.label)}\nInicio: ${startDate}\nFin: ${endDate}\nPuntos: ${metadata.sampleCount}${instrumentDesc}</description>
  ${iconStyles}
  ${segStyles}
  <Folder>
    <name>Recorrido</name>
    ${segmentPlacemarks}
  </Folder>
  <Folder>
    <name>Puntos de medición</name>
    ${pointPlacemarks}
  </Folder>
</Document>
</kml>`
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

      return result[0].values.map((row) => {
        const cols = result[0].columns
        const rowMap = Object.fromEntries(cols.map((col, idx) => [col, row[idx]]))
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
          correctedMeasurement: rowMap.correctedMeasurement as number
        }
      })
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
