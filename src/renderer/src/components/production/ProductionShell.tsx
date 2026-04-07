import { useState } from 'react'
import { useDevices, useSession, useGeoData } from '../../hooks'
import MapView from '../map/MapView'
import PointsTable from './PointsTable'
import DevicesPanel from './DevicesPanel'
import SessionsPanel from './SessionsPanel'
import './production.css'

export default function ProductionShell(): React.JSX.Element {
  // Inicializar hooks principales
  const devices = useDevices()
  const session = useSession()
  const geoData = useGeoData(session.points)
  const [activeTab, setActiveTab] = useState<'devices' | 'sessions'>('devices')

  return (
    <main className="prod-shell">
      <div className="prod-layout">
        {/* Panel lateral con tabs */}
        <div className="side-panel">
          <div className="panel-tabs" role="tablist" aria-label="Panel de navegación">
            <button
              className={`tab-button ${activeTab === 'devices' ? 'active' : ''}`}
              onClick={() => setActiveTab('devices')}
              role="tab"
              id="tab-devices"
              aria-selected={activeTab === 'devices'}
              aria-controls="tabpanel-devices"
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
              title="Historial de sesiones guardadas"
            >
              Historial
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
          </div>
        </div>

        <div className="prod-main">
          <div className="map-container" style={{ position: 'relative' }}>
            {/* Mapa con datos geoespaciales */}
            <MapView geoData={geoData} isSessionActive={session.status === 'running'} />
          </div>
          {/* Tabla de puntos */}
          <PointsTable points={session.points} />
        </div>
      </div>
    </main>
  )
}
