import { useState, useEffect } from 'react'
import { useSession } from '../../hooks/useSession'
import type { SessionItem as SessionItemType } from '../../hooks/usePersistentSessions'
import type { PersistedSession } from '../../../../shared/services/ISessionRepository'
import SessionItemView from './SessionItem'
import './SessionsPanel.css'

export default function SessionsPanel({
  session,
  sessions,
  isLoading,
  error,
  onOpenAllSessions,
  onSessionLoaded,
  onDeleteSession,
  onExportSession,
  onImportSession,
  onGetSession
}: {
  session: ReturnType<typeof useSession>
  sessions: SessionItemType[]
  isLoading: boolean
  error: string | null
  onOpenAllSessions?: () => void
  onSessionLoaded?: (
    bounds: { north: number; south: number; east: number; west: number } | null
  ) => void
  onDeleteSession: (sessionId: string) => Promise<void>
  onExportSession: (sessionId: string, format: 'geojson' | 'xlsx' | 'kmz') => Promise<void>
  onImportSession?: () => Promise<{ sessionId?: string; canceled?: boolean }>
  onGetSession: (sessionId: string) => Promise<PersistedSession>
}): React.JSX.Element {
  const [loadStatus, setLoadStatus] = useState<{
    message: string
    type: 'success' | 'error'
  } | null>(null)

  // Limpiar mensaje de estado después de 3 segundos
  useEffect(() => {
    if (!loadStatus) return
    const timer = setTimeout(() => setLoadStatus(null), 3000)
    return () => clearTimeout(timer)
  }, [loadStatus])

  const handleLoad = (sessionId: string): void => {
    setLoadStatus(null)

    onGetSession(sessionId)
      .then((result) => {
        console.log('[SessionsPanel] getSession result:', result)

        if (result && result.points) {
          console.log(`[SessionsPanel] Loaded ${result.points.length} points from session`)

          // Calcular bounds de la sesión para centrado automático
          const validPoints = result.points.filter(
            (p) => p.position !== null && p.position !== undefined
          )
          let bounds: { north: number; south: number; east: number; west: number } | null = null

          if (validPoints.length > 0) {
            const lats = validPoints.map((p) => p.position.lat)
            const lons = validPoints.map((p) => p.position.lon)
            bounds = {
              north: Math.max(...lats),
              south: Math.min(...lats),
              east: Math.max(...lons),
              west: Math.min(...lons)
            }
          } else if (result.points.length > 0) {
            // Si no hay puntos válidos, al menos tomar el primer punto
            const firstPoint = result.points[0]
            if (firstPoint?.position) {
              bounds = {
                north: firstPoint.position.lat,
                south: firstPoint.position.lat,
                east: firstPoint.position.lon,
                west: firstPoint.position.lon
              }
            }
          }

          // Actualizar el state de sesión con los puntos cargados
          session.setLoadedSession({
            sessionId: result.metadata.id,
            label: result.metadata.label || `Session ${result.metadata.startedAt}`,
            points: validPoints.length > 0 ? validPoints : result.points,
            summary: result.metadata
          })

          // Notificar al contenedor para centrado del mapa
          onSessionLoaded?.(bounds)

          setLoadStatus({
            message: `✓ Sesión cargada: ${result.points.length} puntos`,
            type: 'success'
          })
        } else {
          throw new Error('No se pudieron cargar los puntos de la sesión')
        }
      })
      .catch((err) => {
        console.error('[SessionsPanel] Error loading session:', err)
        setLoadStatus({
          message: `Error al cargar sesión: ${err instanceof Error ? err.message : 'desconocido'}`,
          type: 'error'
        })
      })
  }

  const handleDelete = async (sessionId: string): Promise<void> => {
    try {
      await onDeleteSession(sessionId)
    } catch (err) {
      console.error('Error deleting session:', err)
    }
  }

  const handleImport = async (): Promise<void> => {
    if (!onImportSession) return
    try {
      const result = await onImportSession()
      if (result.canceled) return

      setLoadStatus({
        message: `✓ GeoJSON importado correctamente`,
        type: 'success'
      })
    } catch (err) {
      console.error('Error importing GeoJSON:', err)
      setLoadStatus({
        message: `Error al importar: ${err instanceof Error ? err.message : 'desconocido'}`,
        type: 'error'
      })
    }
  }

  const handleExport = async (
    sessionId: string,
    format: 'geojson' | 'xlsx' | 'kmz'
  ): Promise<void> => {
    try {
      const found = sessions.find((s) => s.id === sessionId)
      if (!found) return

      await onExportSession(sessionId, format)

      setLoadStatus({
        message: `✓ Sesión exportada correctamente`,
        type: 'success'
      })
    } catch (err) {
      console.error(`Error exporting to ${format}:`, err)
      setLoadStatus({
        message: `Error al exportar: ${err instanceof Error ? err.message : 'desconocido'}`,
        type: 'error'
      })
    }
  }

  return (
    <div className="sessions-panel">
      <div className="sessions-header">
        <div className="sessions-header-title">
          <h2>Historial de Sesiones</h2>
          {sessions.length > 0 && <span className="sessions-badge">{sessions.length}</span>}
        </div>
        <div className="sessions-header-actions">
          {onImportSession && (
            <button
              className="sessions-import-btn"
              onClick={handleImport}
              title="Importar GeoJSON cifrado o plano"
              aria-label="Importar GeoJSON"
            >
              📥 Importar
            </button>
          )}
          {onOpenAllSessions && sessions.length > 0 && (
            <button
              className="sessions-view-all-btn"
              onClick={onOpenAllSessions}
              title="Ver todas las sesiones guardadas"
              aria-label="Ver todas las sesiones"
            >
              📋 Ver todas
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-message">Error: {error}</div>}

      {loadStatus && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '8px 12px',
            background:
              loadStatus.type === 'success' ? 'rgba(114, 186, 255, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${loadStatus.type === 'success' ? 'rgba(114, 186, 255, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            borderRadius: '4px',
            fontSize: '12px',
            color: loadStatus.type === 'success' ? '#72baff' : '#fca5a5',
            marginBottom: '8px'
          }}
        >
          {loadStatus.message}
        </div>
      )}

      {isLoading ? (
        <div className="loading">Cargando sesiones...</div>
      ) : sessions.length === 0 ? (
        <div className="sessions-empty-state">
          <p>No hay sesiones guardadas</p>
          <small>Las nuevas sesiones aparecerán aquí</small>
        </div>
      ) : (
        <div className="sessions-list">
          {sessions.slice(0, 5).map((sess) => (
            <SessionItemView
              key={sess.id}
              session={sess}
              onLoad={handleLoad}
              onDelete={handleDelete}
              onExport={handleExport}
            />
          ))}
        </div>
      )}
    </div>
  )
}
