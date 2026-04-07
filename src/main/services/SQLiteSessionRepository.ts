import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import ExcelJS from 'exceljs'
import archiver from 'archiver'
import { PassThrough } from 'stream'
import type { GeoTimestamp } from '../../shared/GeoTimestamp'
import type { SessionSummary } from '../../shared/ipc.types'
import type { ISessionRepository, PersistedSession } from '../../shared/services/ISessionRepository'

/**
 * SQLite-based session persistence using sql.js (WASM)
 * Schema:
 * - sessions: metadata (id, label, startedAt, stoppedAt, sampleCount)
 * - geo_points: individual points (sessionId, position, emf data)
 * - session_stats: pre-calculated statistics (avg_rss, max_rss, etc.)
 */
export class SQLiteSessionRepository implements ISessionRepository {
  private db: SqlJsDatabase | null = null
  private dbPath: string
  private initialized = false
  private pendingPoints = 0
  private flushInterval: ReturnType<typeof setInterval> | null = null
  private readonly FLUSH_EVERY_N_POINTS = 10
  private readonly FLUSH_INTERVAL_MS = 30_000

  constructor() {
    const dataPath = app.getPath('userData')
    this.dbPath = path.join(dataPath, 'sessions.db')
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

    try {
      // Inicializar SQL.js (cargará el WASM automáticamente)
      const SQL = await initSqlJs()

      // Cargar BD existente si existe
      let data: Uint8Array | undefined
      if (fs.existsSync(this.dbPath)) {
        try {
          data = fs.readFileSync(this.dbPath)
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
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)

      this.db.run(`
        CREATE TABLE IF NOT EXISTS geo_points (
          id TEXT PRIMARY KEY,
          sessionId TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          alt REAL,
          hdop REAL,
          rss INTEGER NOT NULL,
          unit TEXT NOT NULL,
          interpolated INTEGER NOT NULL DEFAULT 0
        )
      `)

      this.db.run(`
        CREATE TABLE IF NOT EXISTS session_stats (
          sessionId TEXT PRIMARY KEY,
          avgRss REAL,
          maxRss REAL,
          minRss REAL,
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
    try {
      const data = this.db.export()
      const buffer = Buffer.from(data)
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true })
      fs.writeFileSync(this.dbPath, buffer)
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
        `INSERT INTO sessions (id, label, startedAt, stoppedAt, sampleCount)
         VALUES (?, ?, ?, ?, ?)`,
        [
          sessionId,
          metadata.label,
          this.unixToISO(metadata.startedAt),
          metadata.stoppedAt ? this.unixToISO(metadata.stoppedAt) : null,
          metadata.sampleCount
        ]
      )

      // Guardar puntos
      for (const point of points) {
        db.run(
          `INSERT INTO geo_points 
           (id, sessionId, timestamp, lat, lon, alt, hdop, rss, unit, interpolated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            point.id,
            point.sessionId,
            this.unixToISO(point.timestamp),
            point.position.lat,
            point.position.lon,
            point.position.alt,
            point.position.hdop,
            point.emf.rss,
            point.emf.unit,
            point.interpolated ? 1 : 0
          ]
        )
      }

      // Calcular y guardar estadísticas
      const statsResult = db.exec(
        `SELECT
          AVG(rss) as avgRss,
          MAX(rss) as maxRss,
          MIN(rss) as minRss,
          COUNT(*) as pointCount
        FROM geo_points
        WHERE sessionId = ?`,
        [sessionId]
      )

      const stats = statsResult[0]?.values[0]
        ? {
            avgRss: statsResult[0].values[0][0] as number | null,
            maxRss: statsResult[0].values[0][1] as number | null,
            minRss: statsResult[0].values[0][2] as number | null,
            pointCount: statsResult[0].values[0][3] as number
          }
        : { avgRss: null, maxRss: null, minRss: null, pointCount: 0 }

      db.run(
        `INSERT INTO session_stats (sessionId, avgRss, maxRss, minRss, pointCount)
         VALUES (?, ?, ?, ?, ?)`,
        [sessionId, stats.avgRss, stats.maxRss, stats.minRss, stats.pointCount]
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
        `INSERT INTO sessions (id, label, startedAt, stoppedAt, sampleCount)
         VALUES (?, ?, ?, ?, ?)`,
        [sessionId, metadata.label, this.unixToISO(metadata.startedAt), null, 0]
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
         (id, sessionId, timestamp, lat, lon, alt, hdop, rss, unit, interpolated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          point.id,
          sessionId,
          this.unixToISO(point.timestamp),
          point.position.lat,
          point.position.lon,
          point.position.alt,
          point.position.hdop,
          point.emf.rss,
          point.emf.unit,
          point.interpolated ? 1 : 0
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
      db.run(`UPDATE sessions SET stoppedAt = ?, sampleCount = ? WHERE id = ?`, [
        metadata.stoppedAt ? this.unixToISO(metadata.stoppedAt) : null,
        metadata.sampleCount,
        sessionId
      ])

      // Calcular y guardar estadísticas
      const statsResult = db.exec(
        `SELECT
          AVG(rss) as avgRss,
          MAX(rss) as maxRss,
          MIN(rss) as minRss,
          COUNT(*) as pointCount
        FROM geo_points
        WHERE sessionId = ?`,
        [sessionId]
      )

      const stats = statsResult[0]?.values[0]
        ? {
            avgRss: statsResult[0].values[0][0] as number | null,
            maxRss: statsResult[0].values[0][1] as number | null,
            minRss: statsResult[0].values[0][2] as number | null,
            pointCount: statsResult[0].values[0][3] as number
          }
        : { avgRss: null, maxRss: null, minRss: null, pointCount: 0 }

      db.run(
        `INSERT OR REPLACE INTO session_stats (sessionId, avgRss, maxRss, minRss, pointCount)
         VALUES (?, ?, ?, ?, ?)`,
        [sessionId, stats.avgRss, stats.maxRss, stats.minRss, stats.pointCount]
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
        instrument: null,
        uncertainty: null
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
          timestamp: this.isoToUnix(rowMap.timestamp as string),
          position: {
            lat: rowMap.lat as number,
            lon: rowMap.lon as number,
            alt: (rowMap.alt as number) || 0,
            hdop: (rowMap.hdop as number) || 0
          },
          emf: {
            deviceId: 'nbm550',
            rss: rowMap.rss as number,
            unit: rowMap.unit as 'V/m' | 'A/m' | 'mW/cm^2' | 'W/m^2'
          },
          interpolated: (rowMap.interpolated as number) === 1
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
        `SELECT id, label, startedAt, stoppedAt, sampleCount
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
          instrument: null,
          uncertainty: null
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
          timestamp: rowMap.timestamp as number,
          position: {
            lat: rowMap.lat as number,
            lon: rowMap.lon as number,
            alt: (rowMap.alt as number) || 0,
            hdop: (rowMap.hdop as number) || 0
          },
          emf: {
            deviceId: 'nbm550',
            rss: rowMap.rss as number,
            unit: rowMap.unit as 'V/m' | 'A/m' | 'mW/cm^2' | 'W/m^2'
          },
          interpolated: (rowMap.interpolated as number) === 1
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

    const uncertainty = session?.metadata.uncertainty ?? null

    const features = points.map((point) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [point.position.lon, point.position.lat, point.position.alt]
      },
      properties: {
        id: point.id,
        timestamp: point.timestamp,
        datetime: new Date(point.timestamp).toISOString(),
        hdop: point.position.hdop,
        rss: point.emf.rss,
        rssWithUncertainty: uncertainty != null ? point.emf.rss + uncertainty : null,
        unit: point.emf.unit,
        interpolated: point.interpolated
      }
    }))

    const instrument = session?.metadata.instrument ?? null

    const geojson = {
      type: 'FeatureCollection' as const,
      properties: {
        session: {
          id: session?.metadata.id ?? sessionId,
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
        uncertainty: uncertainty,
        stats: stats
          ? {
              avgRss: stats.avgRss,
              maxRss: stats.maxRss,
              minRss: stats.minRss,
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
      'Latitude',
      'Longitude',
      'Altitude (m)',
      'HDOP',
      'RSS (dBm)',
      'Unit'
    ]

    const rows = points.map((point) => [
      new Date(point.timestamp).toISOString(),
      point.position.lat.toFixed(8),
      point.position.lon.toFixed(8),
      point.position.alt?.toFixed(2) || 'N/A',
      point.position.hdop?.toFixed(2) || 'N/A',
      point.emf.rss,
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
      font: { bold: true, size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
      font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
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
    const uncertainty = metadata.uncertainty

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
      { field: 'Incertidumbre aplicada', value: uncertainty != null ? uncertainty : 'N/A' },
      { field: '', value: '' },
      { field: 'RSS promedio', value: stats?.avgRss?.toFixed(2) ?? 'N/A' },
      { field: 'RSS máximo', value: stats?.maxRss?.toFixed(2) ?? 'N/A' },
      { field: 'RSS mínimo', value: stats?.minRss?.toFixed(2) ?? 'N/A' }
    ])

    // ── Hoja 2: Datos ──
    const dataSheet = workbook.addWorksheet('Datos')

    dataSheet.columns = [
      { header: '#', key: 'index', width: 6 },
      { header: 'Fecha/Hora', key: 'datetime', width: 22 },
      { header: 'Latitud', key: 'lat', width: 14 },
      { header: 'Longitud', key: 'lon', width: 14 },
      { header: 'Altitud (m)', key: 'alt', width: 12 },
      { header: 'HDOP', key: 'hdop', width: 8 },
      { header: 'RSS', key: 'rss', width: 10 },
      { header: 'RSS + Incertidumbre', key: 'rssWithUncertainty', width: 18 },
      { header: 'Unidad', key: 'unit', width: 12 },
      { header: 'Interpolado', key: 'interpolated', width: 12 }
    ]
    dataSheet.getRow(1).eachCell((cell) => {
      cell.style = headerStyle
    })

    points.forEach((point, i) => {
      const rssU = uncertainty != null ? point.emf.rss + uncertainty : null
      dataSheet.addRow({
        index: i + 1,
        datetime: new Date(point.timestamp).toLocaleString('es-AR'),
        lat: point.position.lat,
        lon: point.position.lon,
        alt: point.position.alt ?? 0,
        hdop: point.position.hdop ?? 0,
        rss: point.emf.rss,
        rssWithUncertainty: rssU,
        unit: point.emf.unit,
        interpolated: point.interpolated ? 'Sí' : 'No'
      })
    })

    // Auto-filtro en hoja de datos
    dataSheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: points.length + 1, column: 10 }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer)
  }

  async exportAsKMZ(sessionId: string): Promise<Buffer> {
    const session = await this.getSession(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    const { metadata, points } = session
    const stats = await this.getSessionStats(sessionId)

    // Generar KML
    const kml = this.buildKML(metadata, points, stats)

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
    points: GeoTimestamp[],
    stats: { avgRss: number; maxRss: number; minRss: number; pointCount: number } | null
  ): string {
    const escXml = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    // Escala de color según RSS relativo (verde → amarillo → rojo)
    const rssValues = points.map((p) => p.emf.rss)
    const minRss = stats?.minRss ?? Math.min(...rssValues)
    const maxRss = stats?.maxRss ?? Math.max(...rssValues)
    const range = maxRss - minRss || 1

    const rssToColor = (rss: number): string => {
      const t = Math.max(0, Math.min(1, (rss - minRss) / range))
      // KML uses aabbggrr (alpha, blue, green, red)
      const r = Math.round(255 * t)
      const g = Math.round(255 * (1 - t))
      const hex = (n: number) => n.toString(16).padStart(2, '0')
      return `ff${hex(0)}${hex(g)}${hex(r)}`
    }

    // Generar estilos únicos
    const styles = new Map<string, string>()
    points.forEach((p) => {
      const color = rssToColor(p.emf.rss)
      if (!styles.has(color)) {
        styles.set(color, `style_${styles.size}`)
      }
    })

    const stylesKml = Array.from(styles.entries())
      .map(
        ([color, id]) => `
    <Style id="${id}">
      <IconStyle>
        <color>${color}</color>
        <scale>0.6</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
      </IconStyle>
    </Style>`
      )
      .join('')

    const placemarks = points
      .map((p) => {
        const color = rssToColor(p.emf.rss)
        const styleId = styles.get(color)!
        const dt = new Date(p.timestamp).toISOString()
        const rssU = metadata.uncertainty != null ? p.emf.rss + metadata.uncertainty : ''
        return `
    <Placemark>
      <name>${escXml(p.emf.rss + ' ' + p.emf.unit)}</name>
      <description>${escXml(dt)}</description>
      <styleUrl>#${styleId}</styleUrl>
      <TimeStamp><when>${dt}</when></TimeStamp>
      <Point><coordinates>${p.position.lon},${p.position.lat},${p.position.alt ?? 0}</coordinates></Point>
      <ExtendedData>
        <Data name="rss"><value>${p.emf.rss}</value></Data>
        <Data name="rssWithUncertainty"><value>${rssU}</value></Data>
        <Data name="unit"><value>${escXml(p.emf.unit)}</value></Data>
        <Data name="hdop"><value>${p.position.hdop ?? 0}</value></Data>
        <Data name="interpolated"><value>${p.interpolated}</value></Data>
      </ExtendedData>
    </Placemark>`
      })
      .join('')

    // Línea de recorrido
    const lineCoords = points
      .map((p) => `${p.position.lon},${p.position.lat},${p.position.alt ?? 0}`)
      .join(' ')

    const startDate = new Date(metadata.startedAt).toLocaleString('es-AR')
    const endDate = metadata.stoppedAt
      ? new Date(metadata.stoppedAt).toLocaleString('es-AR')
      : 'N/A'

    const inst = metadata.instrument
    const instrumentDesc = inst
      ? `\nMedidor: ${inst.meter.brand} ${inst.meter.model} (S/N: ${inst.meter.serial})` +
        `\nÚltima calibración: ${inst.meter.lastCalibrationDate ?? 'N/A'}` +
        `\nSonda: ${inst.probe.brand} ${inst.probe.model} (S/N: ${inst.probe.serial})` +
        `\nIncertidumbre: ${metadata.uncertainty ?? 'N/A'}`
      : ''

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escXml(metadata.label)}</name>
  <description>Sesión: ${escXml(metadata.label)}\nInicio: ${startDate}\nFin: ${endDate}\nPuntos: ${metadata.sampleCount}${instrumentDesc}</description>
  ${stylesKml}
  <Style id="lineStyle">
    <LineStyle><color>ff0000ff</color><width>2</width></LineStyle>
  </Style>
  <Folder>
    <name>Recorrido</name>
    <Placemark>
      <name>Trayecto</name>
      <styleUrl>#lineStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${lineCoords}</coordinates>
      </LineString>
    </Placemark>
  </Folder>
  <Folder>
    <name>Puntos de medición</name>
    ${placemarks}
  </Folder>
</Document>
</kml>`
  }

  /**
   * Obtener estadísticas pre-calculadas de sesión
   */
  async getSessionStats(
    sessionId: string
  ): Promise<{ avgRss: number; maxRss: number; minRss: number; pointCount: number } | null> {
    await this.initialize()
    const db = this.ensureDb()

    try {
      const result = db.exec(
        `SELECT avgRss, maxRss, minRss, pointCount FROM session_stats WHERE sessionId = ?`,
        [sessionId]
      )

      if (!result[0] || !result[0].values[0]) return null

      const row = result[0].values[0]
      const cols = result[0].columns
      const rowMap = Object.fromEntries(cols.map((col, idx) => [col, row[idx]]))

      return {
        avgRss: rowMap.avgRss as number,
        maxRss: rowMap.maxRss as number,
        minRss: rowMap.minRss as number,
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
          timestamp: rowMap.timestamp as number,
          position: {
            lat: rowMap.lat as number,
            lon: rowMap.lon as number,
            alt: (rowMap.alt as number) || 0,
            hdop: (rowMap.hdop as number) || 0
          },
          emf: {
            deviceId: 'nbm550',
            rss: rowMap.rss as number,
            unit: rowMap.unit as 'V/m' | 'A/m' | 'mW/cm^2' | 'W/m^2'
          },
          interpolated: (rowMap.interpolated as number) === 1
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
      this.save()
      this.db.close()
      this.db = null
      this.initialized = false
      console.log('[SQLiteSessionRepository] Database closed')
    }
  }
}
