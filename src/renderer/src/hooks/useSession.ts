import { useEffect, useState, useCallback, useRef } from 'react'
import type { GeoTimestamp } from '../../../shared/GeoTimestamp'
import type { SessionSummary } from '../../../shared/ipc.types'

export interface SessionState {
  sessionId: string | null
  status: 'idle' | 'running' | 'stopped'
  startedAt: number | null
  label: string
  points: GeoTimestamp[]
  summary: SessionSummary | null
}

/**
 * Hook para gestión del ciclo de vida de sesiones
 * Encapsula inicio/parada y recolección de puntos geospaciales
 */
export function useSession() {
  const [session, setSession] = useState<SessionState>({
    sessionId: null,
    status: 'idle',
    startedAt: null,
    label: 'Nueva sesión',
    points: [],
    summary: null
  })

  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const unsubscribeRef = useRef<(() => void)[]>([])

  // Iniciar sesión
  const start = useCallback(
    async (options?: {
      label?: string
      triggerMode?: 'distance' | 'time'
      minDistanceMeters?: number
      intervalMs?: number
      testMode?: boolean
    }) => {
      try {
        setError(null)
        // Si testMode está activado, NO pasar triggerMode (dejar que SessionService lo maneje)
        const config = {
          label: options?.label || 'Nueva sesión',
          ...(options?.testMode ? {} : { triggerMode: options?.triggerMode || 'distance' }),
          minDistanceMeters: options?.minDistanceMeters,
          intervalMs: options?.intervalMs,
          testMode: options?.testMode || false
        }
        console.log('[useSession] Calling session.start() with config:', config)
        const sessionId = await window.api.session.start(config)

        setSession((prev) => ({
          ...prev,
          sessionId,
          status: 'running',
          startedAt: Date.now(),
          label: options?.label || prev.label,
          points: []
        }))

        return sessionId
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al iniciar sesión'
        setError(message)
        throw err
      }
    },
    []
  )

  // Detener sesión
  const stop = useCallback(async () => {
    try {
      setError(null)
      const summary = await window.api.session.stop()

      setSession((prev) => ({
        ...prev,
        status: 'stopped',
        summary
      }))

      return summary
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al detener sesión'
      setError(message)
      throw err
    }
  }, [])

  // Reset estado
  const reset = useCallback(() => {
    setSession({
      sessionId: null,
      status: 'idle',
      startedAt: null,
      label: 'Nueva sesión',
      points: [],
      summary: null
    })
    setError(null)
  }, [])

  // Event listeners para IPC
  useEffect(() => {
    const listeners: (() => void)[] = []

    // Listener para nuevos puntos
    const unsubscribeSample = window.api.session.onSample((point: GeoTimestamp) => {
      setSession((prev) => ({
        ...prev,
        points: [...prev.points, point]
      }))
    })
    listeners.push(unsubscribeSample)

    // Listener para inicio de sesión
    const unsubscribeStarted = window.api.session.onStarted((data) => {
      setSession((prev) => ({
        ...prev,
        sessionId: data.sessionId,
        status: 'running',
        startedAt: data.startedAt,
        label: data.label,
        points: []
      }))
      setDuration(0)
    })
    listeners.push(unsubscribeStarted)

    // Listener para fin de sesión
    const unsubscribeStopped = window.api.session.onStopped((summary: SessionSummary) => {
      setSession((prev) => ({
        ...prev,
        status: 'stopped',
        summary
      }))
    })
    listeners.push(unsubscribeStopped)

    unsubscribeRef.current = listeners

    return () => {
      listeners.forEach((unsub) => unsub())
    }
  }, [])

  // Timer para actualizar duración cada segundo cuando sesión está corriendo
  useEffect(() => {
    if (session.status !== 'running' || !session.startedAt) return

    const timer = setInterval(() => {
      setDuration(Date.now() - (session.startedAt as number))
    }, 1000)

    return () => clearInterval(timer)
  }, [session.status, session.startedAt])

  // Cargar sesión guardada
  const setLoadedSession = useCallback(
    (loadedData: {
      sessionId: string
      label: string
      points: GeoTimestamp[]
      summary: SessionSummary
    }) => {
      console.log('[useSession] Loading saved session:', loadedData.sessionId)
      setSession({
        sessionId: loadedData.sessionId,
        status: 'stopped',
        startedAt: loadedData.summary.startedAt,
        label: loadedData.label,
        points: loadedData.points,
        summary: loadedData.summary
      })
      setDuration((loadedData.summary.stoppedAt || Date.now()) - loadedData.summary.startedAt)
    },
    []
  )

  return {
    // Estado
    sessionId: session.sessionId,
    status: session.status,
    label: session.label,
    startedAt: session.startedAt,
    points: session.points,
    summary: session.summary,
    error,

    // Métodos
    start,
    stop,
    reset,
    setLoadedSession,

    // Helpers
    isRunning: session.status === 'running',
    isStopped: session.status === 'stopped',
    isIdle: session.status === 'idle',
    pointCount: session.points.length,
    duration
  }
}
