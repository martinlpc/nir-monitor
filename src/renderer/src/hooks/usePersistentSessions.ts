import { useEffect, useState, useCallback } from 'react'
import type { SessionSummary } from '../../../shared/ipc.types'
import type { GeoTimestamp } from '../../../shared/GeoTimestamp'
import type { PersistedSession } from '../../../shared/services/ISessionRepository'

export interface SessionItem extends SessionSummary {
  // Extiende SessionSummary para agregar información de presentación si es necesario
  isPersisted: boolean
}

/**
 * Hook para gestión de sesiones guardadas (historial)
 * permite listar, obtener, eliminar y exportar sesiones
 */
export function usePersistentSessions() {
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cargar lista de sesiones
  const loadSessions = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const persistedSessions = await window.api.session.list()
      const sessionItems: SessionItem[] = persistedSessions.map((s) => ({
        ...s,
        isPersisted: true
      }))
      setSessions(sessionItems)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error loading sessions'
      setError(message)
      console.error('[usePersistentSessions] Error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Escuchar cuando se detiene una sesión y refrescar historial
  useEffect(() => {
    // Cargar sesiones primero
    loadSessions()

    // Luego escuchar eventos de sesión detenida
    const unsubscribe = window.api.session.onStopped(() => {
      console.log('[usePersistentSessions] Session stopped event received, reloading sessions...')
      loadSessions()
    })

    return () => {
      unsubscribe()
    }
  }, [loadSessions])

  // Obtener sesión completa (con puntos)
  const getSession = useCallback(async (sessionId: string): Promise<PersistedSession> => {
    try {
      const result = await window.api.session.get(sessionId)
      if (result.success && result.session) {
        return result.session
      } else {
        throw new Error(result.error || 'Unknown error')
      }
    } catch (err) {
      console.error('[usePersistentSessions] Error getting session:', err)
      throw err
    }
  }, [])

  // Eliminar sesión
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      setError(null)
      const result = await window.api.session.delete(sessionId)
      if (result.success) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      } else {
        throw new Error(result.error || 'Failed to delete session')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error deleting session'
      setError(message)
      throw err
    }
  }, [])

  // Exportar como GeoJSON
  const exportGeoJSON = useCallback(async (sessionId: string): Promise<string> => {
    try {
      const result = await window.api.session.exportGeoJSON(sessionId)
      if (result.success && result.data) {
        return result.data
      } else {
        throw new Error(result.error || 'Failed to export as GeoJSON')
      }
    } catch (err) {
      console.error('[usePersistentSessions] Error exporting GeoJSON:', err)
      throw err
    }
  }, [])

  // Exportar como CSV
  const exportCSV = useCallback(async (sessionId: string): Promise<string> => {
    try {
      const result = await window.api.session.exportCSV(sessionId)
      if (result.success && result.data) {
        return result.data
      } else {
        throw new Error(result.error || 'Failed to export as CSV')
      }
    } catch (err) {
      console.error('[usePersistentSessions] Error exporting CSV:', err)
      throw err
    }
  }, [])

  // Exportar con diálogo nativo (GeoJSON, XLSX, KMZ)
  const exportSession = useCallback(
    async (
      sessionId: string,
      format: 'geojson' | 'xlsx' | 'kmz',
      label: string
    ): Promise<{ filePath?: string; canceled?: boolean }> => {
      try {
        const result = await window.api.session.export(sessionId, format, label)
        if (result.canceled) {
          return { canceled: true }
        }
        if (result.success && result.filePath) {
          return { filePath: result.filePath }
        }
        throw new Error(result.error || `Failed to export as ${format}`)
      } catch (err) {
        console.error(`[usePersistentSessions] Error exporting ${format}:`, err)
        throw err
      }
    },
    []
  )

  // Obtener estadísticas pre-calculadas
  const getStats = useCallback(
    async (
      sessionId: string
    ): Promise<{
      avgRss: number
      maxRss: number
      minRss: number
      pointCount: number
    } | null> => {
      try {
        const result = await window.api.session.getStats(sessionId)
        if (result.success) {
          return result.stats || null
        } else {
          console.error('[usePersistentSessions] Error getting stats:', result.error)
          return null
        }
      } catch (err) {
        console.error('[usePersistentSessions] Error:', err)
        return null
      }
    },
    []
  )

  // Buscar puntos dentro de bounds
  const getPointsInBounds = useCallback(
    async (
      sessionId: string,
      north: number,
      south: number,
      east: number,
      west: number
    ): Promise<GeoTimestamp[]> => {
      try {
        const result = await window.api.session.getPointsInBounds(
          sessionId,
          north,
          south,
          east,
          west
        )
        if (result.success && result.points) {
          return result.points
        } else {
          console.error('[usePersistentSessions] Error querying bounds:', result.error)
          return []
        }
      } catch (err) {
        console.error('[usePersistentSessions] Error:', err)
        return []
      }
    },
    []
  )

  return {
    // Estado
    sessions,
    isLoading,
    error,

    // Métodos
    loadSessions,
    getSession,
    deleteSession,
    exportGeoJSON,
    exportCSV,
    exportSession,
    getStats,
    getPointsInBounds,

    // Helpers
    totalSessions: sessions.length,
    hasError: error !== null
  }
}
