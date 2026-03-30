import { useDevices, useSession, useGeoData } from '../../hooks'
import MapView from '../map/MapView'
import DevicesPanel from './DevicesPanel'
import './production.css'

export default function ProductionShell(): React.JSX.Element {
  // Inicializar hooks principales
  const devices = useDevices()
  const session = useSession()
  const geoData = useGeoData(session.points)

  return (
    <main className="prod-shell">
      <div className="prod-layout">
        {/* Panel de dispositivos - pass hooks down */}
        <DevicesPanel
          devices={devices}
          session={session}
          onSessionStateChange={() => {
            // Estado sincronizado automáticamente via hooks
          }}
        />

        <div className="prod-main">
          <div className="map-container" style={{ position: 'relative' }}>
            {/* Mapa con datos geoespaciales */}
            <MapView geoData={geoData} isSessionActive={session.status === 'running'} />
          </div>
        </div>
      </div>
    </main>
  )
}
