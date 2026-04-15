import { useCallback, useState } from 'react'
import { useDevices, useSession, useGeoData } from '../../hooks'
import { GpsPositionProvider } from '../../hooks/useGpsPosition'
import MapView from '../map/MapView'
import PointsTable from './PointsTable'
import DevicesPanel from './DevicesPanel'
import SessionsPanel from './SessionsPanel'
import SettingsPanel from './SettingsPanel'
import './production.css'

export default function ProductionShell(): React.JSX.Element {
  // Inicializar hooks principales
  const devices = useDevices()
  const session = useSession()
  const geoData = useGeoData(session.points, session.pointCount)
  const [activeTab, setActiveTab] = useState<'devices' | 'sessions' | 'settings'>('devices')
  const [followPosition, setFollowPosition] = useState(true)
  const [mapMaximized, setMapMaximized] = useState(false)

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
              <SessionsPanel session={session} />
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
            />
          </div>
          {/* Tabla de puntos */}
          {!mapMaximized && <PointsTable points={session.points} />}
        </div>
      </div>
    </main>
    </GpsPositionProvider>
  )
}
