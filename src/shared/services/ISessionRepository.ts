import type { GeoTimestamp } from '../GeoTimestamp'
import type { SessionSummary } from '../ipc.types'

export interface PersistedSession {
  metadata: SessionSummary
  points: GeoTimestamp[]
}

export interface SessionStats {
  avgCorrected: number
  maxCorrected: number
  minCorrected: number
  pointCount: number
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
   * Exportar sesión como XLSX (3 archivos ENACOM: reporte, reporte_p, averif)
   * @param sessionId ID de la sesión
   * @param folderPath Carpeta destino
   * @param label Etiqueta para nombres de archivo
   * @returns Lista de rutas de archivos generados
   */
  exportAsXLSX(sessionId: string, folderPath: string, label: string): Promise<string[]>

  /**
   * Obtener estadísticas pre-calculadas de una sesión
   */
  getSessionStats(sessionId: string): Promise<SessionStats | null>

  /**
   * Buscar puntos dentro de un bounding box geográfico
   */
  getPointsInBounds(
    sessionId: string,
    north: number,
    south: number,
    east: number,
    west: number
  ): Promise<GeoTimestamp[]>
}
