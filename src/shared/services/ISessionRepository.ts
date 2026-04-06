import type { GeoTimestamp } from '../GeoTimestamp'
import type { SessionSummary } from '../ipc.types'

export interface PersistedSession {
  metadata: SessionSummary
  points: GeoTimestamp[]
}

export interface ISessionRepository {
  /**
   * Guardar sesión completada (metadatos + puntos)
   */
  saveSession(sessionId: string, metadata: SessionSummary, points: GeoTimestamp[]): Promise<void>

  /**
   * Obtener sesión completada por ID
   */
  getSession(sessionId: string): Promise<PersistedSession | null>

  /**
   * Listar todas las sesiones (solo metadatos)
   */
  listSessions(): Promise<SessionSummary[]>

  /**
   * Eliminar sesión del almacenamiento
   */
  deleteSession(sessionId: string): Promise<void>

  /**
   * Obtener puntos de una sesión (sin metadatos)
   */
  getSessionPoints(sessionId: string): Promise<GeoTimestamp[]>

  /**
   * Exportar sesión como GeoJSON
   */
  exportAsGeoJSON(sessionId: string): Promise<string>

  /**
   * Exportar sesión como CSV
   */
  exportAsCSV(sessionId: string): Promise<string>
}
