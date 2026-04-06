import * as fs from 'fs/promises'
import * as path from 'path'
import { app } from 'electron'
import type { GeoTimestamp } from '../../shared/GeoTimestamp'
import type { SessionSummary } from '../../shared/ipc.types'
import type { ISessionRepository, PersistedSession } from '../../shared/services/ISessionRepository'

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

  async exportAsGeoJSON(sessionId: string): Promise<string> {
    const points = await this.getSessionPoints(sessionId)
    const geojson = this.toGeoJSON(points)
    return JSON.stringify(geojson, null, 2)
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
      'Latitude',
      'Longitude',
      'Altitude',
      'HDOP',
      'RSS (dBm)',
      'Unit'
    ]

    // Filas
    const rows = points.map((point) => [
      new Date(point.timestamp).toISOString(),
      point.sessionId,
      point.position.lat.toFixed(8),
      point.position.lon.toFixed(8),
      point.position.alt?.toFixed(2) || 'N/A',
      point.position.hdop?.toFixed(2) || 'N/A',
      point.emf.rss,
      point.emf.unit
    ])

    // Combinar
    const csv = [headers, ...rows].map((row) => '"' + row.join('","') + '"').join('\n')

    return csv
  }

  /**
   * Convertir array de GeoTimestamp a FeatureCollection GeoJSON
   */
  private toGeoJSON(points: GeoTimestamp[]) {
    const features = points.map((point) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [point.position.lon, point.position.lat, point.position.alt || 0]
      },
      properties: {
        id: point.id,
        sessionId: point.sessionId,
        timestamp: point.timestamp,
        hdop: point.position.hdop,
        rss: point.emf.rss,
        unit: point.emf.unit,
        interpolated: point.interpolated
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
        sessionId: string
        timestamp: number
        hdop?: number
        rss: number
        unit: string
        interpolated: boolean
      }
    }[]
  }): GeoTimestamp[] {
    return geojson.features.map((feature) => ({
      id: feature.properties.id,
      sessionId: feature.properties.sessionId,
      timestamp: feature.properties.timestamp,
      position: {
        lat: feature.geometry.coordinates[1],
        lon: feature.geometry.coordinates[0],
        alt: feature.geometry.coordinates[2],
        hdop: feature.properties.hdop ?? 0
      },
      emf: {
        deviceId: 'nbm550',
        rss: feature.properties.rss,
        unit: feature.properties.unit as 'V/m' | 'A/m' | 'mW/cm^2' | 'W/m^2'
      },
      interpolated: feature.properties.interpolated
    }))
  }
}
