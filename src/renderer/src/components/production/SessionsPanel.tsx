import { useState, useEffect } from 'react'
import { usePersistentSessions } from '../../hooks'
import { useSession } from '../../hooks/useSession'
import { formatDurationMs } from '../../utils/formatters'
import type { SessionSummary } from '../../../../shared/ipc.types'
import './SessionsPanel.css'

interface SessionItemProps {
  session: SessionSummary
  onLoad: (session: SessionSummary) => void
  onDelete: (sessionId: string) => void
  onExport: (sessionId: string, format: 'geojson' | 'csv') => void
}

function SessionItem({ session, onLoad, onDelete, onExport }: SessionItemProps) {
  const [showActions, setShowActions] = useState(false)

  const duration = session.stoppedAt
    ? formatDurationMs(session.stoppedAt - session.startedAt)
    : '(en curso)'

  const formattedDate = new Date(session.startedAt).toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <div className="session-item" onMouseEnter={() => setShowActions(true)} onMouseLeave={() => setShowActions(false)}>
      <div className="session-info">
        <div className="session-header">
          <h3 className="session-label">{session.label}</h3>
          <span className="session-date">{formattedDate}</span>
        </div>
        <div className="session-stats">
          <span className="stat">
            <strong>{session.sampleCount}</strong> puntos
          </span>
          <span className="stat">
            <strong>{duration}</strong>
          </span>
        </div>
      </div>

      {showActions && (
        <div className="session-actions">
          <button
            className="btn-primary"
            onClick={() => onLoad(session)}
            title="Cargar sesión"
          >
            Cargar
          </button>
          <button
            className="btn-secondary"
            onClick={() => onExport(session.id, 'geojson')}
            title="Exportar como GeoJSON"
          >
            GeoJSON
          </button>
          <button
            className="btn-secondary"
            onClick={() => onExport(session.id, 'csv')}
            title="Exportar como CSV"
          >
            CSV
          </button>
          <button
            className="btn-danger"
            onClick={() => onDelete(session.id)}
            title="Eliminar sesión"
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
  )
}

export default function SessionsPanel({
  session
}: {
  session: ReturnType<typeof useSession>
}): React.JSX.Element {
  const { sessions, isLoading, error, deleteSession, exportGeoJSON, exportCSV, loadSessions, getSession } =
    usePersistentSessions()
  const [loadStatus, setLoadStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Limpiar mensaje de estado después de 3 segundos
  useEffect(() => {
    if (!loadStatus) return
    const timer = setTimeout(() => setLoadStatus(null), 3000)
    return () => clearTimeout(timer)
  }, [loadStatus])

  const handleLoad = (sessionId: string): void => {
    setLoadStatus(null)
    
    getSession(sessionId)
      .then((result) => {
        console.log('[SessionsPanel] getSession result:', result)
        
        if (result && result.points) {
          console.log(`[SessionsPanel] Loaded ${result.points.length} points from session`)
          
          // Actualizar el state de sesión con los puntos cargados
          session.setLoadedSession({
            sessionId: result.metadata.id,
            label: result.metadata.label || `Session ${result.metadata.startedAt}`,
            points: result.points,
            summary: result.metadata
          })
          
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

  const handleDelete = async (sessionId: string) => {
    if (window.confirm('¿Confirmar eliminación de sesión?')) {
      try {
        await deleteSession(sessionId)
      } catch (err) {
        console.error('Error deleting session:', err)
      }
    }
  }

  const handleExport = async (sessionId: string, format: 'geojson' | 'csv') => {
    try {
      const session = sessions.find((s) => s.id === sessionId)
      if (!session) return

      let data: string
      let filename: string

      if (format === 'geojson') {
        data = await exportGeoJSON(sessionId)
        filename = `${session.label}-map.geojson`
      } else {
        data = await exportCSV(sessionId)
        filename = `${session.label}-data.csv`
      }

      // Descargar archivo
      const blob = new Blob([data], {
        type: format === 'geojson' ? 'application/geo+json' : 'text/csv'
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(`Error exporting to ${format}:`, err)
      alert(`Error al exportar: ${err}`)
    }
  }

  return (
    <div className="sessions-panel">
      <div className="sessions-header">
        <h2>Historial de Sesiones</h2>
        {sessions.length > 0 && <span className="badge">{sessions.length}</span>}
      </div>

      {error && <div className="error-message">Error: {error}</div>}
      
      {loadStatus && (
        <div style={{
          padding: '8px 12px',
          background: loadStatus.type === 'success' ? '#f0f7ff' : '#fff5f5',
          border: `1px solid ${loadStatus.type === 'success' ? '#72baff' : '#ff5252'}`,
          borderRadius: '4px',
          fontSize: '12px',
          color: loadStatus.type === 'success' ? '#0066cc' : '#cc0000',
          marginBottom: '8px'
        }}>
          {loadStatus.message}
        </div>
      )}

      {isLoading ? (
        <div className="loading">Cargando sesiones...</div>
      ) : sessions.length === 0 ? (
        <div className="empty-state">
          <p>No hay sesiones guardadas</p>
          <small>Las nuevas sesiones aparecerán aquí</small>
        </div>
      ) : (
        <div className="sessions-list">
          {sessions.map((sess) => (
            <SessionItem
              key={sess.id}
              session={sess}
              onLoad={() => handleLoad(sess.id)}
              onDelete={handleDelete}
              onExport={handleExport}
            />
          ))}
        </div>
      )}
    </div>
  )
}
