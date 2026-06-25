import { useCallback, useRef, useState, useEffect } from 'react'
import L from 'leaflet'
import {
  useDevices,
  useSession,
  useGeoData,
  useTheme,
  useTileProvider,
  useTileCache
} from '../../hooks'
import { useMultipleSessions } from '../../hooks/useMultipleSessions'
import { usePersistentSessions } from '../../hooks/usePersistentSessions'
import { GpsPositionProvider } from '../../hooks/GpsPositionProvider'
import MapView from '../map/MapView'
import PointsTable from './PointsTable'
import DevicesPanel from './DevicesPanel'
import SessionsPanel from './SessionsPanel'
import SettingsPanel from './SettingsPanel'
import AllSessionsDrawer from './AllSessionsDrawer'
import { useToast } from './ToastProvider'
import './production.css'

export default function ProductionShell(): React.JSX.Element {
  const devices = useDevices()
  const session = useSession()
  const geoData = useGeoData(session.points, session.pointCount)
  const multipleSessions = useMultipleSessions()
  const persistedSessions = usePersistentSessions()
  const { notify } = useToast()
  const { theme, setTheme } = useTheme()
  const { provider, setProvider, providers } = useTileProvider()
  const tileCache = useTileCache()
  const [activeTab, setActiveTab] = useState<'devices' | 'sessions' | 'settings'>('devices')
  const [followPosition, setFollowPosition] = useState(true)
  const [mapMaximized, setMapMaximized] = useState(false)
  const [tableMaximized, setTableMaximized] = useState(false)
  const [allSessionsDrawerOpen, setAllSessionsDrawerOpen] = useState(false)
  const [focusSessionBounds, setFocusSessionBounds] = useState<{
    north: number
    south: number
    east: number
    west: number
  } | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)

  /* ── Portrait / hybrid mode ── */
  const [isPortrait, setIsPortrait] = useState(
    () => window.matchMedia('(orientation: portrait)').matches
  )
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)')
    const handler = (e: MediaQueryListEvent) => {
      setIsPortrait(e.matches)
      if (!e.matches) setPanelOpen(false)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const handleMapReady = useCallback((map: L.Map) => {
    mapInstanceRef.current = map
  }, [])

  const selectMapBounds = useCallback(() => {
    const map = mapInstanceRef.current
    if (!map) return null
    const bounds = map.getBounds()
    return {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
      zoom: map.getZoom()
    }
  }, [])

  const handleTabClick = useCallback(
    (tab: 'devices' | 'sessions' | 'settings') => {
      if (isPortrait) {
        if (panelOpen && activeTab === tab) {
          setPanelOpen(false)
        } else {
          setActiveTab(tab)
          setPanelOpen(true)
        }
      } else {
        setActiveTab(tab)
      }
    },
    [isPortrait, panelOpen, activeTab]
  )

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const tabs: Array<'devices' | 'sessions' | 'settings'> = [
          'devices',
          'sessions',
          'settings'
        ]
        const idx = tabs.indexOf(activeTab)
        const next =
          e.key === 'ArrowRight'
            ? tabs[(idx + 1) % tabs.length]
            : tabs[(idx - 1 + tabs.length) % tabs.length]
        const btn = document.getElementById(`tab-${next}`)
        btn?.focus()
        handleTabClick(next)
      }
    },
    [activeTab, handleTabClick]
  )

  useEffect(() => {
    if (multipleSessions.loadedSessions.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFollowPosition(false)
    }
  }, [multipleSessions.loadedSessions.length])

  return (
    <GpsPositionProvider>
      <main className="prod-shell">
        <div className="prod-layout">
          <div className={`side-panel${isPortrait && panelOpen ? ' panel-open' : ''}`}>
            <div
              className="panel-tabs"
              role="tablist"
              aria-label="Panel de navegación"
              onKeyDown={handleTabKeyDown}
            >
              <button
                className={`tab-button ${activeTab === 'devices' ? 'active' : ''}`}
                onClick={() => handleTabClick('devices')}
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
                onClick={() => handleTabClick('sessions')}
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
                onClick={() => handleTabClick('settings')}
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
                  sessions={persistedSessions.sessions}
                  isLoading={persistedSessions.isLoading}
                  error={persistedSessions.error}
                  onOpenAllSessions={() => setAllSessionsDrawerOpen(true)}
                  onSessionLoaded={(bounds) => {
                    setFollowPosition(false)
                    setFocusSessionBounds(bounds)
                  }}
                  onDeleteSession={async (sessionId) => {
                    try {
                      await persistedSessions.deleteSession(sessionId)
                    } catch (err) {
                      console.error('[ProductionShell] Error deleting session:', err)
                    }
                  }}
                  onExportSession={async (sessionId, format) => {
                    const found = persistedSessions.sessions.find((s) => s.id === sessionId)
                    if (!found) return { canceled: true }
                    try {
                      const result = await persistedSessions.exportSession(
                        sessionId,
                        format,
                        found.label
                      )
                      return result
                    } catch (err) {
                      const message =
                        err instanceof Error ? err.message : 'Desconocido'
                      notify({ type: 'error', message: `Error al exportar: ${message}` })
                      return { canceled: true }
                    }
                  }}
                  onGetSession={async (sessionId) => {
                    const result = await persistedSessions.getSession(sessionId)
                    return result
                  }}
                  onImportSession={async () => {
                    return await persistedSessions.importGeoJSON()
                  }}
                />
              </div>
              <div
                role="tabpanel"
                id="tabpanel-settings"
                aria-labelledby="tab-settings"
                style={{ display: activeTab === 'settings' ? 'block' : 'none' }}
              >
                <SettingsPanel
                  theme={theme}
                  onThemeChange={setTheme}
                  tileProviders={providers}
                  selectedProvider={provider}
                  onProviderChange={setProvider}
                  cacheStats={tileCache.stats}
                  onClearCache={tileCache.clearCache}
                  onImportTiles={tileCache.importTiles}
                  onPreloadTiles={tileCache.startPreload}
                  onCancelPreload={tileCache.cancelPreload}
                  preloadProgress={tileCache.preloadProgress}
                  onSelectMapBounds={selectMapBounds}
                />
              </div>
            </div>
          </div>

          <div className="prod-main">
            <div
              className={`map-container ${mapMaximized ? 'map-maximized' : tableMaximized ? 'map-table-maximized' : ''}`}
              style={{ position: 'relative' }}
            >
              {session.status !== 'running' &&
                (session.sessionId || multipleSessions.loadedSessions.length > 0) && (
                  <button
                    className="map-clear-btn"
                    onClick={() => {
                      session.reset()
                      multipleSessions.clearSessions()
                      setFocusSessionBounds(null)
                    }}
                    title="Limpiar sesión cargada"
                    aria-label="Limpiar sesión cargada"
                  >
                    ✕ Limpiar sesión cargada
                  </button>
                )}
              <MapView
                geoData={geoData}
                isSessionActive={session.status === 'running'}
                followPosition={followPosition}
                onFollowPositionChange={setFollowPosition}
                maximized={mapMaximized}
                onToggleMaximize={() => setMapMaximized((prev) => !prev)}
                loadedSessions={multipleSessions.loadedSessions}
                focusSessionBounds={focusSessionBounds}
                tileProvider={provider}
                onMapReady={handleMapReady}
              />
            </div>
            {!mapMaximized && (
              <PointsTable
                points={session.points}
                sessionId={session.sessionId}
                sessionLabel={session.label}
                correctionFactor={session.summary?.correctionFactor}
                deviceModel={session.summary?.instrument?.meter?.model || null}
                deviceSerial={session.summary?.instrument?.meter?.serial || null}
                probeModel={session.summary?.instrument?.probe?.model || null}
                probeSerial={session.summary?.instrument?.probe?.serial || null}
                tableMaximized={tableMaximized}
                onToggleMaximizeTable={() => setTableMaximized((prev) => !prev)}
              />
            )}
          </div>
        </div>

        {isPortrait && panelOpen && (
          <div className="portrait-backdrop" onClick={() => setPanelOpen(false)} />
        )}

        <AllSessionsDrawer
          isOpen={allSessionsDrawerOpen}
          onClose={() => setAllSessionsDrawerOpen(false)}
          sessions={persistedSessions.sessions}
          isLoading={persistedSessions.isLoading}
          loadedSessionIds={new Set(multipleSessions.loadedSessions.map((s) => s.id))}
          onToggleSession={(sessionId, checked) => {
            if (checked) {
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
          onExport={async (sessionId, format) => {
            const found = persistedSessions.sessions.find((s) => s.id === sessionId)
            if (!found) return

            try {
              const result = await persistedSessions.exportSession(sessionId, format, found.label)
              if (!result.canceled) {
                console.log(`[ProductionShell] Exported to: ${result.filePaths?.join(', ')}`)
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Desconocido'
              notify({ type: 'error', message: `Error al exportar: ${message}` })
            }
          }}
          onDelete={(sessionId) => {
            multipleSessions.removeSession(sessionId)
            persistedSessions.deleteSession(sessionId).catch((err) => {
              console.error('[ProductionShell] Error deleting session:', err)
            })
          }}
        />
      </main>
    </GpsPositionProvider>
  )
}
