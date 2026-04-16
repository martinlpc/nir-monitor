import { useCallback, useState, useEffect } from 'react'
import { useDevices, useSession, useGeoData } from '../../hooks'
import { useMultipleSessions } from '../../hooks/useMultipleSessions'
import { usePersistentSessions } from '../../hooks/usePersistentSessions'
import { GpsPositionProvider } from '../../hooks/useGpsPosition'
import MapView from '../map/MapView'
import PointsTable from './PointsTable'
import DevicesPanel from './DevicesPanel'
import SessionsPanel from './SessionsPanel'
import SettingsPanel from './SettingsPanel'
import AllSessionsDrawer from './AllSessionsDrawer'
import './production.css'

export default function ProductionShell(): React.JSX.Element {
  // Inicializar hooks principales
  const devices = useDevices()
  const session = useSession()
  const geoData = useGeoData(session.points, session.pointCount)
  const multipleSessions = useMultipleSessions()
  const persistedSessions = usePersistentSessions()
  const [activeTab, setActiveTab] = useState<'devices' | 'sessions' | 'settings'>('devices')
  const [followPosition, setFollowPosition] = useState(true)
  const [mapMaximized, setMapMaximized] = useState(false)
  const [allSessionsDrawerOpen, setAllSessionsDrawerOpen] = useState(false)
  const [focusSessionBounds, setFocusSessionBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null)

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      setActiveTab((prev) => {
        const tabs: Array<'devices' | 'sessions' | 'settings'> = ['devices', 'sessions', 'settings']
        const idx = tabs.indexOf(prev)
        const next = e.key === 'ArrowRight'
          ? tabs[(idx + 1) % tabs.length]
          : tabs[(idx - 1 + tabs.length) % tabs.length]
        const btn = document.getElementById(`tab-${next}`)
        btn?.focus()
        return next
      })
    }
  }, [])

  // Manejar toggle de sesión en drawer
  const handleToggleSessionInDrawer = useCallback(
    (sessionId: string, checked: boolean) => {
      if (checked) {
        // Cargar sesión y agregarla a múltiples
        // Esto se hace desde SessionsPanel pasando callback
      } else {
        multipleSessions.removeSession(sessionId)
      }
    },
    [multipleSessions]
  )

  // Calcular bounds cuando se cargan/quitan sesiones para centrar el mapa en todo lo visible
  useEffect(() => {
    // Recolectar todos los puntos de todas las sesiones cargadas
    const allPoints = multipleSessions.loadedSessions
      .flatMap((s) => s.points)
      .filter((p) => p.position !== null && p.position !== undefined)

    // También incluir puntos de la sesión activa/cargada
    const activePoints = session.points.filter((p) => p.position !== null && p.position !== undefined)
    const combined = [...allPoints, ...activePoints]

    if (combined.length === 0) {
      setFocusSessionBounds(null)
      return
    }

    // Desactivar seguimiento GPS al cargar sesiones
    if (multipleSessions.loadedSessions.length > 0) {
      setFollowPosition(false)
    }

    const lats = combined.map((p) => p.position.lat)
    const lons = combined.map((p) => p.position.lon)

    setFocusSessionBounds({
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lons),
      west: Math.min(...lons)
    })
  }, [multipleSessions.loadedSessions, session.points])

  return (
    <GpsPositionProvider>
    <main className="prod-shell">
      <div className="prod-layout">
        {/* Panel lateral con tabs */}
        <div className="side-panel">
          <div className="panel-tabs" role="tablist" aria-label="Panel de navegación" onKeyDown={handleTabKeyDown}>
            <button
              className={`tab-button ${activeTab === 'devices' ? 'active' : ''}`}
              onClick={() => setActiveTab('devices')}
              role="tab"
              id="tab-devices"
              aria-selected={activeTab === 'devices'}
              aria-controls="tabpanel-devices"
              tabIndex={activeTab === 'devices' ? 0 : -1}
              title="Dispositivos y sesión actual"
            >
              Dispositivos
            </button>
            <button
              className={`tab-button ${activeTab === 'sessions' ? 'active' : ''}`}
              onClick={() => setActiveTab('sessions')}
              role="tab"
              id="tab-sessions"
              aria-selected={activeTab === 'sessions'}
              aria-controls="tabpanel-sessions"
              tabIndex={activeTab === 'sessions' ? 0 : -1}
              title="Historial de sesiones guardadas"
            >
              Historial
            </button>
            <button
              className={`tab-button tab-button--icon ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
              role="tab"
              id="tab-settings"
              aria-selected={activeTab === 'settings'}
              aria-controls="tabpanel-settings"
              tabIndex={activeTab === 'settings' ? 0 : -1}
              title="Configuración"
            >
              ⚙
            </button>
          </div>

          <div className="panel-content">
            {/* Mantener ambos componentes montados pero solo mostrar uno - preserva estado */}
            <div
              role="tabpanel"
              id="tabpanel-devices"
              aria-labelledby="tab-devices"
              style={{ display: activeTab === 'devices' ? 'block' : 'none' }}
            >
              <DevicesPanel
                devices={devices}
                session={session}
                followPosition={followPosition}
                onFollowPositionChange={setFollowPosition}
              />
            </div>
            <div
              role="tabpanel"
              id="tabpanel-sessions"
              aria-labelledby="tab-sessions"
              style={{ display: activeTab === 'sessions' ? 'block' : 'none' }}
            >
              <SessionsPanel 
                session={session}
                onOpenAllSessions={() => setAllSessionsDrawerOpen(true)}
                onAddSessionToMap={multipleSessions.addSession}
                loadedSessionIds={new Set(multipleSessions.loadedSessions.map((s) => s.id))}
                onSessionLoaded={(bounds) => {
                  setFollowPosition(false)
                  setFocusSessionBounds(bounds)
                }}
              />
            </div>
            <div
              role="tabpanel"
              id="tabpanel-settings"
              aria-labelledby="tab-settings"
              style={{ display: activeTab === 'settings' ? 'block' : 'none' }}
            >
              <SettingsPanel />
            </div>
          </div>
        </div>

        <div className="prod-main">
          <div className={`map-container ${mapMaximized ? 'map-maximized' : ''}`} style={{ position: 'relative' }}>
            {/* Mapa con datos geoespaciales */}
            <MapView
              geoData={geoData}
              isSessionActive={session.status === 'running'}
              followPosition={followPosition}
              onFollowPositionChange={setFollowPosition}
              maximized={mapMaximized}
              onToggleMaximize={() => setMapMaximized((prev) => !prev)}
              loadedSessions={multipleSessions.loadedSessions}
              focusSessionBounds={focusSessionBounds}
            />
          </div>
          {/* Tabla de puntos */}
          {!mapMaximized && (
            <PointsTable 
              points={session.points}
              sessionId={session.sessionId}
              sessionLabel={session.label}
            />
          )}
        </div>
      </div>

      {/* All Sessions Drawer */}
      <AllSessionsDrawer
        isOpen={allSessionsDrawerOpen}
        onClose={() => setAllSessionsDrawerOpen(false)}
        sessions={persistedSessions.sessions}
        isLoading={persistedSessions.isLoading}
        loadedSessionIds={new Set(multipleSessions.loadedSessions.map((s) => s.id))}
        onToggleSession={(sessionId, checked) => {
          if (checked) {
            // Cargar sesión completa
            persistedSessions
              .getSession(sessionId)
              .then((fullSession) => {
                const sessionInfo = persistedSessions.sessions.find((s) => s.id === sessionId)
                multipleSessions.addSession(
                  sessionId,
                  fullSession.metadata.label || `Session ${fullSession.metadata.startedAt}`,
                  fullSession.points,
                  sessionInfo
                )
              })
              .catch((err) => {
                console.error('[ProductionShell] Error loading session for drawer:', err)
              })
          } else {
            multipleSessions.removeSession(sessionId)
          }
        }}
        onLoadSession={(sessionId) => {
          // Cargar como sesión principal
          setFollowPosition(false)
          persistedSessions
            .getSession(sessionId)
            .then((result) => {
              session.setLoadedSession({
                sessionId: result.metadata.id,
                label: result.metadata.label || `Session ${result.metadata.startedAt}`,
                points: result.points,
                summary: result.metadata
              })
              setAllSessionsDrawerOpen(false)
            })
            .catch((err) => {
              console.error('[ProductionShell] Error loading session as primary:', err)
            })
        }}
        onExport={(sessionId, format) => {
          const found = persistedSessions.sessions.find((s) => s.id === sessionId)
          if (!found) return

          persistedSessions
            .exportSession(sessionId, format, found.label)
            .then((result) => {
              if (!result.canceled) {
                console.log(`[ProductionShell] Exported to: ${result.filePath}`)
              }
            })
            .catch((err) => {
              console.error(`[ProductionShell] Error exporting to ${format}:`, err)
            })
        }}
      />
    </main>
    </GpsPositionProvider>
  )
}
