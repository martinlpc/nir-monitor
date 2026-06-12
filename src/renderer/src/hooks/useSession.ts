import { useEffect, useState, useCallback, useRef } from 'react'
import type { GeoTimestamp } from '../../../shared/GeoTimestamp'
import type { SessionSummary } from '../../../shared/ipc.types'

export interface SessionState {
  sessionId: string | null
  status: 'idle' | 'running' | 'stopped'
  startedAt: number | null
  label: string
  summary: SessionSummary | null
}

function deriveCorrectionFactorFromPoints(points: GeoTimestamp[]): number | null {
  for (const point of points) {
    const measured = point.emf.rawMeasurement
    const corrected = point.correctedMeasurement
    if (measured > 0 && Number.isFinite(measured) && Number.isFinite(corrected)) {
      const factor = corrected / measured
      if (Number.isFinite(factor) && factor > 0) {
        return Number(factor.toFixed(6))
      }
    }
  }
  return null
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
    summary: null
  })

  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const unsubscribeRef = useRef<(() => void)[]>([])
  const pointsRef = useRef<GeoTimestamp[]>([])
  const [pointCount, setPointCount] = useState(0)

  // Iniciar sesión
  const start = useCallback(
    async (options?: {
      label?: string
      triggerMode?: 'distance' | 'time'
      minDistanceMeters?: number
      intervalMs?: number
      testMode?: boolean
      provincia?: string
      localidad?: string
      apellido1?: string
      apellido2?: string
    }) => {
      try {
        setError(null)
        // Si testMode está activado, NO pasar triggerMode (dejar que SessionService lo maneje)
        const config: Record<string, unknown> = {
          label: options?.label || 'Nueva sesión',
          testMode: options?.testMode || false
        }
        if (options?.triggerMode) config.triggerMode = options.triggerMode
        if (options?.minDistanceMeters !== undefined)
          config.minDistanceMeters = options.minDistanceMeters
        if (options?.intervalMs !== undefined) config.intervalMs = options.intervalMs
        if (options?.provincia) config.provincia = options.provincia
        if (options?.localidad) config.localidad = options.localidad
        if (options?.apellido1) config.apellido1 = options.apellido1
        if (options?.apellido2) config.apellido2 = options.apellido2
        console.log('[useSession] Calling session.start() with config:', config)
        const sessionId = await window.api.session.start(config)

        setSession((prev) => ({
          ...prev,
          sessionId,
          status: 'running',
          startedAt: Date.now(),
          label: options?.label || prev.label
        }))
        pointsRef.current = []
        setPointCount(0)

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
      summary: null
    })
    pointsRef.current = []
    setPointCount(0)
    setError(null)
  }, [])

  // Event listeners para IPC
  useEffect(() => {
    const listeners: (() => void)[] = []

    // Listener para nuevos puntos
    const unsubscribeSample = window.api.session.onSample((point: GeoTimestamp) => {
      pointsRef.current.push(point)
      setPointCount((c) => c + 1)
    })
    listeners.push(unsubscribeSample)

    // Listener para inicio de sesión
    const unsubscribeStarted = window.api.session.onStarted((data) => {
      const summary: SessionSummary = {
        id: data.sessionId,
        label: data.label,
        startedAt: data.startedAt,
        stoppedAt: null,
        sampleCount: 0,
        correctionFactor: data.correctionFactor,
        instrument: data.instrument
      }
      setSession((prev) => ({
        ...prev,
        sessionId: data.sessionId,
        status: 'running',
        startedAt: data.startedAt,
        label: data.label,
        summary
      }))
      pointsRef.current = []
      setPointCount(0)
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

    const unsubscribeAlert = window.api.session.onAlert((data) => {
      setError(data.message)
    })
    listeners.push(unsubscribeAlert)

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
      const effectiveCorrectionFactor =
        loadedData.summary.correctionFactor ?? deriveCorrectionFactorFromPoints(loadedData.points)
      pointsRef.current = loadedData.points
      setPointCount(loadedData.points.length)
      setSession({
        sessionId: loadedData.sessionId,
        status: 'stopped',
        startedAt: loadedData.summary.startedAt,
        label: loadedData.label,
        summary: {
          ...loadedData.summary,
          correctionFactor: effectiveCorrectionFactor
        }
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
    points: pointsRef.current,
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
    pointCount,
    duration
  }
}
