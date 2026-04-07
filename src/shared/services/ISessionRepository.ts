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
   * Inicializar una sesión nueva en el almacenamiento (solo metadatos, sin puntos)
   */
  initSession(sessionId: string, metadata: SessionSummary): Promise<void>

  /**
   * Agregar un punto individual a una sesión existente
   */
  addPoint(sessionId: string, point: GeoTimestamp): Promise<void>

  /**
   * Finalizar sesión: actualizar metadatos finales y computar estadísticas
   */
  finalizeSession(sessionId: string, metadata: SessionSummary): Promise<void>

  /**
   * Forzar flush de la base de datos a disco
   */
  flush(): void

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
   * Exportar sesión como GeoJSON (con metadata de sesión en propiedades del FeatureCollection)
   */
  exportAsGeoJSON(sessionId: string): Promise<string>

  /**
   * Exportar sesión como XLSX (reporte con hojas de resumen y datos)
   */
  exportAsXLSX(sessionId: string): Promise<Buffer>

  /**
   * Exportar sesión como KMZ (KML comprimido para Google Earth)
   */
  exportAsKMZ(sessionId: string): Promise<Buffer>

  /**
   * Exportar sesión como CSV
   */
  exportAsCSV(sessionId: string): Promise<string>
}
