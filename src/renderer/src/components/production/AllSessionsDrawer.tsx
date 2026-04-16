import { useState, useMemo } from 'react'
import type { SessionItem } from '../../hooks/usePersistentSessions'
import { formatTimestamp } from '../../utils/formatters'
import './AllSessionsDrawer.css'

interface AllSessionsDrawerProps {
  isOpen: boolean
  onClose: () => void
  sessions: SessionItem[]
  isLoading: boolean
  loadedSessionIds: Set<string>
  onToggleSession: (sessionId: string, checked: boolean) => void
  onLoadSession?: (sessionId: string) => void
  onExport?: (sessionId: string, format: 'geojson' | 'xlsx' | 'kmz') => void
  onDelete?: (sessionId: string) => void
}

export default function AllSessionsDrawer({
  isOpen,
  onClose,
  sessions,
  isLoading,
  loadedSessionIds,
  onToggleSession,
  onLoadSession,
  onExport,
  onDelete
}: AllSessionsDrawerProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'name'>('date-desc')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Filtrar y ordenar sesiones
  const filteredSessions = useMemo(() => {
    let result = sessions.filter(
      (s) =>
        s.label?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        formatTimestamp(s.startedAt).toLowerCase().includes(searchQuery.toLowerCase())
    )

    switch (sortBy) {
      case 'date-asc':
        result.sort((a, b) => a.startedAt - b.startedAt)
        break
      case 'date-desc':
        result.sort((a, b) => b.startedAt - a.startedAt)
        break
      case 'name':
        result.sort((a, b) => (a.label || '').localeCompare(b.label || ''))
        break
    }

    return result
  }, [sessions, searchQuery, sortBy])

  return (
    <>
      {/* Backdrop */}
      {isOpen && <div className="drawer-backdrop" onClick={onClose} />}

      {/* Drawer */}
      <div className={`all-sessions-drawer ${isOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="drawer-header">
          <h2>Todas las Sesiones</h2>
          <button
            className="drawer-close-btn"
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar panel de sesiones"
          >
            ✕
          </button>
        </div>

        {/* Controles */}
        <div className="drawer-controls">
          <input
            type="text"
            placeholder="Buscar sesión..."
            className="drawer-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Buscar sesiones"
          />
          <select
            className="drawer-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            aria-label="Ordenar por"
          >
            <option value="date-desc">Más recientes</option>
            <option value="date-asc">Más antiguas</option>
            <option value="name">Nombre A-Z</option>
          </select>
        </div>

        {/* Lista de sesiones */}
        <div className="drawer-content">
          {isLoading ? (
            <div className="drawer-loading">Cargando sesiones...</div>
          ) : filteredSessions.length === 0 ? (
            <div className="drawer-empty">
              {sessions.length === 0 ? 'No hay sesiones guardadas' : 'Sin resultados'}
            </div>
          ) : (
            <div className="sessions-list">
              {filteredSessions.map((session) => {
                const isChecked = loadedSessionIds.has(session.id)

                return (
                  <div key={session.id} className="session-item">
                    <label className="session-checkbox-label">
                      <input
                        type="checkbox"
                        className="session-checkbox"
                        checked={isChecked}
                        onChange={(e) => onToggleSession(session.id, e.target.checked)}
                        aria-label={`Ver sesión ${session.label}`}
                      />
                      <span className="checkbox-custom" />
                    </label>

                    <div className="session-info">
                      <div className="session-date">{formatTimestamp(session.startedAt)}</div>
                      <div className="session-label">{session.label || 'Sin nombre'}</div>
                    </div>

                    <div className="session-actions">
                      {onDelete && (
                        confirmDeleteId === session.id ? (
                          <div className="drawer-delete-confirm-group">
                            <button
                              className="btn-delete-confirm btn-delete-accept"
                              onClick={() => { onDelete(session.id); setConfirmDeleteId(null) }}
                              title="Confirmar eliminación"
                              aria-label="Confirmar eliminación"
                            >
                              ✓
                            </button>
                            <button
                              className="btn-delete-confirm btn-delete-cancel"
                              onClick={() => setConfirmDeleteId(null)}
                              title="Cancelar"
                              aria-label="Cancelar eliminación"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            className="action-btn action-btn-delete"
                            onClick={() => setConfirmDeleteId(session.id)}
                            title="Eliminar sesión"
                            aria-label={`Eliminar sesión ${session.label}`}
                          >
                            🗑
                          </button>
                        )
                      )}
                      {onLoadSession && (
                        <button
                          className="action-btn action-btn-load"
                          onClick={() => onLoadSession(session.id)}
                          title="Cargar como sesión principal"
                          aria-label={`Cargar sesión ${session.label}`}
                        >
                          ▶
                        </button>
                      )}
                      {onExport && (
                        <>
                          <button
                            className="action-btn action-btn-export"
                            onClick={() => onExport(session.id, 'xlsx')}
                            title="Exportar como Excel"
                            aria-label={`Exportar ${session.label} como Excel`}
                          >
                            📊
                          </button>
                          <button
                            className="action-btn action-btn-export"
                            onClick={() => onExport(session.id, 'kmz')}
                            title="Exportar como KMZ"
                            aria-label={`Exportar ${session.label} como KMZ`}
                          >
                            🗺
                          </button>
                          <button
                            className="action-btn action-btn-export"
                            onClick={() => onExport(session.id, 'geojson')}
                            title="Exportar como GeoJSON"
                            aria-label={`Exportar ${session.label} como GeoJSON`}
                          >
                            🔗
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer con contador */}
        {sessions.length > 0 && (
          <div className="drawer-footer">
            <span className="session-counter">
              {loadedSessionIds.size} de {sessions.length} visibles
            </span>
          </div>
        )}
      </div>
    </>
  )
}
