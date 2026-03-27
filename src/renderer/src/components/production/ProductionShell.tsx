import MapView from '../map/MapView'
import DevicesPanel from './DevicesPanel'
import './production.css'

export default function ProductionShell(): React.JSX.Element {
  const handleSessionStateChange = (): void => {
    // Handle session state changes
  }

  return (
    <main className="prod-shell">
      <div className="prod-layout">
        <DevicesPanel onSessionStateChange={handleSessionStateChange} />

        <div className="prod-main">
          <div className="map-container" style={{ position: 'relative' }}>
            <MapView />
          </div>
        </div>
      </div>
    </main>
  )
}
