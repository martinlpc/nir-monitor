import * as fs from 'fs/promises'
import * as path from 'path'
import { app } from 'electron'
import type { GeoTimestamp } from '../../shared/GeoTimestamp'
import type { SessionSummary } from '../../shared/ipc.types'
import type {
  ISessionRepository,
  PersistedSession,
  SessionStats
} from '../../shared/services/ISessionRepository'

/**
 * File-based session persistence
 * Stores sessions in ~/.nir-monitor/sessions/
 */
export class FileSessionRepository implements ISessionRepository {
  private sessionsDir: string

  constructor() {
    const dataPath = app.getPath('userData')
    this.sessionsDir = path.join(dataPath, 'sessions')
  }

  /**
   * Asegurar que el directorio de sesiones existe
   */
  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true })
    } catch (err) {
      console.error('Error creating sessions directory:', err)
      throw new Error(`Cannot create sessions directory: ${err}`)
    }
  }

  /**
   * Ruta para metadatos de sesión
   */
  private getMetadataPath(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId, 'metadata.json')
  }

  /**
   * Ruta para puntos de sesión en GeoJSON
   */
  private getPointsPath(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId, 'points.geojson')
  }

  /**
   * Directorio de sesión individual
   */
  private getSessionDir(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId)
  }

  async saveSession(
    sessionId: string,
    metadata: SessionSummary,
    points: GeoTimestamp[]
  ): Promise<void> {
    await this.ensureDir()

    const sessionDir = this.getSessionDir(sessionId)

    try {
      // Crear directorio de sesión
      await fs.mkdir(sessionDir, { recursive: true })

      // Guardar metadatos
      await fs.writeFile(
        this.getMetadataPath(sessionId),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      )

      // Guardar puntos como GeoJSON
      const geojson = this.toGeoJSON(points)
      await fs.writeFile(this.getPointsPath(sessionId), JSON.stringify(geojson, null, 2), 'utf-8')
    } catch (err) {
      console.error(`Error saving session ${sessionId}:`, err)
      throw new Error(`Cannot save session: ${err}`)
    }
  }

  async initSession(sessionId: string, metadata: SessionSummary): Promise<void> {
    await this.ensureDir()
    const sessionDir = this.getSessionDir(sessionId)
    await fs.mkdir(sessionDir, { recursive: true })
    await fs.writeFile(this.getMetadataPath(sessionId), JSON.stringify(metadata, null, 2), 'utf-8')
    // Crear archivo de puntos vacío
    const geojson = this.toGeoJSON([])
    await fs.writeFile(this.getPointsPath(sessionId), JSON.stringify(geojson, null, 2), 'utf-8')
  }

  async addPoint(sessionId: string, point: GeoTimestamp): Promise<void> {
    try {
      const pointsPath = this.getPointsPath(sessionId)
      const content = await fs.readFile(pointsPath, 'utf-8')
      const geojson = JSON.parse(content)
      const points = this.fromGeoJSON(geojson)
      points.push(point)
      const updated = this.toGeoJSON(points)
      await fs.writeFile(pointsPath, JSON.stringify(updated, null, 2), 'utf-8')
    } catch (err) {
      console.error(`Error adding point to session ${sessionId}:`, err)
    }
  }

  async finalizeSession(sessionId: string, metadata: SessionSummary): Promise<void> {
    await fs.writeFile(this.getMetadataPath(sessionId), JSON.stringify(metadata, null, 2), 'utf-8')
  }

  flush(): void {
    // No-op: file-based repo writes to disk on every operation
  }

  async getSession(sessionId: string): Promise<PersistedSession | null> {
    try {
      const metadataPath = this.getMetadataPath(sessionId)
      const pointsPath = this.getPointsPath(sessionId)

      // Verificar que ambos archivos existen
      try {
        await fs.access(metadataPath)
        await fs.access(pointsPath)
      } catch {
        return null
      }

      // Leer metadatos
      const metadataContent = await fs.readFile(metadataPath, 'utf-8')
      const metadata: SessionSummary = JSON.parse(metadataContent)

      // Leer puntos desde GeoJSON
      const geojsonContent = await fs.readFile(pointsPath, 'utf-8')
      const geojson = JSON.parse(geojsonContent)
      const points = this.fromGeoJSON(geojson)

      return { metadata, points }
    } catch (err) {
      console.error(`Error loading session ${sessionId}:`, err)
      return null
    }
  }

  async listSessions(): Promise<SessionSummary[]> {
    await this.ensureDir()

    try {
      const entries = await fs.readdir(this.sessionsDir, { withFileTypes: true })
      const sessions: SessionSummary[] = []

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const metadataPath = path.join(entry.parentPath, entry.name, 'metadata.json')
        try {
          const content = await fs.readFile(metadataPath, 'utf-8')
          const metadata: SessionSummary = JSON.parse(content)
          sessions.push(metadata)
        } catch {
          // Saltar directorios sin metadata válido
          continue
        }
      }

      // Ordenar por fecha descendente
      return sessions.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    } catch (err) {
      console.error('Error listing sessions:', err)
      return []
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const sessionDir = this.getSessionDir(sessionId)

    try {
      await fs.rm(sessionDir, { recursive: true, force: true })
    } catch (err) {
      console.error(`Error deleting session ${sessionId}:`, err)
      throw new Error(`Cannot delete session: ${err}`)
    }
  }

  async getSessionPoints(sessionId: string): Promise<GeoTimestamp[]> {
    try {
      const pointsPath = this.getPointsPath(sessionId)
      const content = await fs.readFile(pointsPath, 'utf-8')
      const geojson = JSON.parse(content)
      return this.fromGeoJSON(geojson)
    } catch (err) {
      console.error(`Error loading points for session ${sessionId}:`, err)
      return []
    }
  }

  async getSessionStats(sessionId: string): Promise<SessionStats | null> {
    try {
      const points = await this.getSessionPoints(sessionId)
      if (points.length === 0)
        return { avgCorrected: 0, maxCorrected: 0, minCorrected: 0, pointCount: 0 }

      const values = points.map((p) => p.correctedMeasurement)
      return {
        avgCorrected: values.reduce((a, b) => a + b, 0) / values.length,
        maxCorrected: Math.max(...values),
        minCorrected: Math.min(...values),
        pointCount: values.length
      }
    } catch (err) {
      console.error(`Error computing stats for session ${sessionId}:`, err)
      return null
    }
  }

  async getPointsInBounds(
    sessionId: string,
    north: number,
    south: number,
    east: number,
    west: number
  ): Promise<GeoTimestamp[]> {
    try {
      const all = await this.getSessionPoints(sessionId)
      return all.filter(
        (p) =>
          p.position.lat >= south &&
          p.position.lat <= north &&
          p.position.lon >= west &&
          p.position.lon <= east
      )
    } catch (err) {
      console.error(`Error querying bounds for session ${sessionId}:`, err)
      return []
    }
  }

  async exportAsGeoJSON(sessionId: string): Promise<string> {
    const session = await this.getSession(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    const { metadata, points } = session
    const instrument = metadata.instrument

    const features = points.map((point) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [point.position.lon, point.position.lat, point.position.alt || 0]
      },
      properties: {
        id: point.id,
        sequenceNumber: point.sequenceNumber,
        sessionId: point.sessionId,
        timestamp: point.timestamp,
        rawMeasurement: point.emf.rawMeasurement,
        correctedMeasurement: point.correctedMeasurement,
        unit: point.emf.unit
      }
    }))

    const geojson = {
      type: 'FeatureCollection' as const,
      properties: {
        session: {
          id: metadata.id,
          label: metadata.label,
          provincia: metadata.provincia ?? null,
          localidad: metadata.localidad ?? null,
          apellido1: metadata.apellido1 ?? null,
          apellido2: metadata.apellido2 ?? null,
          startedAt: new Date(metadata.startedAt).toISOString(),
          stoppedAt: metadata.stoppedAt ? new Date(metadata.stoppedAt).toISOString() : null,
          sampleCount: metadata.sampleCount
        },
        instrument: instrument
          ? {
              meter: {
                brand: instrument.meter.brand,
                model: instrument.meter.model,
                serial: instrument.meter.serial,
                lastCalibrationDate: instrument.meter.lastCalibrationDate
              },
              probe: {
                brand: instrument.probe.brand,
                model: instrument.probe.model,
                serial: instrument.probe.serial
              }
            }
          : null,
        correctionFactor: metadata.correctionFactor ?? null
      },
      features
    }

    return JSON.stringify(geojson, null, 2)
  }

  async exportAsXLSX(): Promise<string[]> {
    throw new Error('XLSX export is not supported by FileSessionRepository')
  }

  async exportAsKMZ(): Promise<Buffer> {
    throw new Error('KMZ export is not supported by FileSessionRepository')
  }

  async exportAsCSV(sessionId: string): Promise<string> {
    const session = await this.getSession(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const { points } = session

    // Encabezados
    const headers = [
      'Timestamp',
      'Session ID',
      'Sequence Number',
      'Latitude',
      'Longitude',
      'Altitude',
      'Raw (V/m)',
      'Corrected (V/m)',
      'Unit'
    ]

    // Filas
    const rows = points.map((point) => [
      new Date(point.timestamp).toISOString(),
      point.sessionId,
      point.sequenceNumber,
      point.position.lat.toFixed(8),
      point.position.lon.toFixed(8),
      point.position.alt?.toFixed(2) || 'N/A',
      point.emf.rawMeasurement.toFixed(2),
      point.correctedMeasurement.toFixed(2),
      point.emf.unit
    ])

    // Combinar
    const csv = [headers, ...rows].map((row) => '"' + row.join('","') + '"').join('\n')

    return csv
  }

  /**
   * Convertir array de GeoTimestamp a FeatureCollection GeoJSON
   */
  private toGeoJSON(points: GeoTimestamp[]): {
    type: string
    features: Array<{
      type: string
      geometry: { type: string; coordinates: number[] }
      properties: Record<string, unknown>
    }>
  } {
    const features = points.map((point) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [point.position.lon, point.position.lat, point.position.alt || 0]
      },
      properties: {
        id: point.id,
        sequenceNumber: point.sequenceNumber,
        sessionId: point.sessionId,
        timestamp: point.timestamp,
        rawMeasurement: point.emf.rawMeasurement,
        correctedMeasurement: point.correctedMeasurement,
        unit: point.emf.unit
      }
    }))

    return {
      type: 'FeatureCollection' as const,
      features
    }
  }

  /**
   * Convertir FeatureCollection GeoJSON a array de GeoTimestamp
   */
  private fromGeoJSON(geojson: {
    features: {
      geometry: { coordinates: [number, number, number] }
      properties: {
        id: string
        sequenceNumber: number
        sessionId: string
        timestamp: number
        rawMeasurement: number
        correctedMeasurement: number
        unit: string
      }
    }[]
  }): GeoTimestamp[] {
    return geojson.features.map((feature) => ({
      id: feature.properties.id,
      sessionId: feature.properties.sessionId,
      sequenceNumber: feature.properties.sequenceNumber,
      timestamp: feature.properties.timestamp,
      position: {
        lat: feature.geometry.coordinates[1],
        lon: feature.geometry.coordinates[0],
        alt: feature.geometry.coordinates[2]
      },
      emf: {
        deviceId: 'nbm550',
        rawMeasurement: feature.properties.rawMeasurement,
        unit: feature.properties.unit as 'V/m' | 'A/m' | 'mW/cm^2' | 'W/m^2'
      },
      correctedMeasurement: feature.properties.correctedMeasurement
    }))
  }
}
