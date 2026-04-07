import { useState } from 'react'
import { formatDurationMs } from '../../utils/formatters'
import type { SessionSummary } from '../../../../shared/ipc.types'

interface SessionItemProps {
  session: SessionSummary
  onLoad: (sessionId: string) => void
  onDelete: (sessionId: string) => void
  onExport: (sessionId: string, format: 'geojson' | 'xlsx' | 'kmz') => void
}

export default function SessionItem({ session, onLoad, onDelete, onExport }: SessionItemProps) {
  const [showActions, setShowActions] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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

  const handleDeleteClick = () => {
    if (confirmDelete) {
      onDelete(session.id)
      setConfirmDelete(false)
    } else {
      setConfirmDelete(true)
    }
  }

  return (
    <div
      className="session-item"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setConfirmDelete(false) }}
      onFocus={() => setShowActions(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setShowActions(false)
          setConfirmDelete(false)
        }
      }}
    >
      <button
        className={`btn-delete-session ${confirmDelete ? 'confirm' : ''}`}
        onClick={handleDeleteClick}
        title={confirmDelete ? 'Confirmar eliminación' : 'Eliminar sesión'}
        aria-label={confirmDelete ? 'Confirmar eliminación' : 'Eliminar sesión'}
      >
        🗑
      </button>

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
            onClick={() => onLoad(session.id)}
            title="Cargar sesión"
          >
            Cargar
          </button>
          <button
            className="btn-secondary"
            onClick={() => onExport(session.id, 'xlsx')}
            title="Exportar como Excel (reporte)"
          >
            Excel
          </button>
          <button
            className="btn-secondary"
            onClick={() => onExport(session.id, 'kmz')}
            title="Exportar como KMZ (Google Earth)"
          >
            KMZ
          </button>
          <button
            className="btn-secondary"
            onClick={() => onExport(session.id, 'geojson')}
            title="Exportar como GeoJSON"
          >
            GeoJSON
          </button>
        </div>
      )}
    </div>
  )
}
