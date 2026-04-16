import { useState, useCallback } from 'react'
import type { GeoTimestamp } from '../../../shared/GeoTimestamp'
import type { SessionItem } from './usePersistentSessions'

// Paleta de colores para múltiples sesiones
const SESSION_COLORS = [
  '#FF5733', // Rojo
  '#3399FF', // Azul
  '#2ECC71', // Verde
  '#F39C12', // Naranja
  '#9B59B6', // Púrpura
  '#1ABC9C', // Turquesa
  '#E74C3C', // Rojo oscuro
  '#34495E', // Gris
  '#FFD700', // Dorado
  '#FF69B4' // Rosa
]

export interface LoadedSession {
  id: string
  label: string
  points: GeoTimestamp[]
  color: string
  visible: boolean
  sessionInfo?: SessionItem // Info de la sesión original
}

/**
 * Hook para gestión de múltiples sesiones visibles en el mapa simultáneamente
 */
export function useMultipleSessions() {
  const [loadedSessions, setLoadedSessions] = useState<LoadedSession[]>([])

  // Agregar sesión a la lista visible
  const addSession = useCallback(
    (sessionId: string, label: string, points: GeoTimestamp[], sessionInfo?: SessionItem) => {
      setLoadedSessions((prev) => {
        // Evitar duplicados
        if (prev.some((s) => s.id === sessionId)) {
          return prev
        }

        const colorIndex = prev.length % SESSION_COLORS.length
        const newSession: LoadedSession = {
          id: sessionId,
          label,
          points,
          color: SESSION_COLORS[colorIndex],
          visible: true,
          sessionInfo
        }

        return [...prev, newSession]
      })
    },
    []
  )

  // Remover sesión de la lista
  const removeSession = useCallback((sessionId: string) => {
    setLoadedSessions((prev) => prev.filter((s) => s.id !== sessionId))
  }, [])

  // Toggle visibilidad sin descargar
  const toggleSessionVisibility = useCallback((sessionId: string) => {
    setLoadedSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, visible: !s.visible } : s))
    )
  }, [])

  // Cambiar color de sesión
  const setSessionColor = useCallback((sessionId: string, color: string) => {
    setLoadedSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, color } : s)))
  }, [])

  // Limpiar todas las sesiones
  const clearSessions = useCallback(() => {
    setLoadedSessions([])
  }, [])

  // Obtener sesión visible
  const getSession = useCallback(
    (sessionId: string) => {
      return loadedSessions.find((s) => s.id === sessionId)
    },
    [loadedSessions]
  )

  // Obtener puntos de sesión si está visible
  const getVisiblePoints = useCallback(
    (sessionId: string) => {
      const session = loadedSessions.find((s) => s.id === sessionId && s.visible)
      return session?.points ?? []
    },
    [loadedSessions]
  )

  return {
    loadedSessions,
    addSession,
    removeSession,
    toggleSessionVisibility,
    setSessionColor,
    clearSessions,
    getSession,
    getVisiblePoints
  }
}
