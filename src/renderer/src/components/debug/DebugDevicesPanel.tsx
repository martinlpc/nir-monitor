import DebugDeviceCard from './DebugDeviceCard'
import type { DebugPanelState } from './types'

interface DebugDevicesPanelProps {
  state: DebugPanelState
  onRefreshPorts: () => void
  onScanDevices: () => void
  onRefreshDevices: () => void
  onSetSelectedPort: (deviceId: 'nbm550' | 'gps', port: string) => void
  onSetPort: (deviceId: 'nbm550' | 'gps') => void
  onConnectDevice: (deviceId: 'nbm550' | 'gps') => void
  onDisconnectDevice: (deviceId: 'nbm550' | 'gps') => void
}

export default function DebugDevicesPanel({
  state,
  onRefreshPorts,
  onScanDevices,
  onRefreshDevices,
  onSetSelectedPort,
  onSetPort,
  onConnectDevice,
  onDisconnectDevice
}: DebugDevicesPanelProps): React.JSX.Element {
  return (
    <article className="panel">
      <div className="panel-head">
        <h2>Puertos y Dispositivos</h2>
        <button onClick={onRefreshPorts}>Refrescar puertos</button>
      </div>

      <div className="device-grid">
        <DebugDeviceCard
          title="NBM-550"
          state={state.deviceState.nbm550}
          selectedPort={state.selectedPorts.nbm550}
          ports={state.ports}
          onPortChange={(port) => onSetSelectedPort('nbm550', port)}
          onSetPort={() => onSetPort('nbm550')}
          onConnect={() => onConnectDevice('nbm550')}
          onDisconnect={() => onDisconnectDevice('nbm550')}
        />

        <DebugDeviceCard
          title="GPS"
          state={state.deviceState.gps}
          selectedPort={state.selectedPorts.gps}
          ports={state.ports}
          onPortChange={(port) => onSetSelectedPort('gps', port)}
          onSetPort={() => onSetPort('gps')}
          onConnect={() => onConnectDevice('gps')}
          onDisconnect={() => onDisconnectDevice('gps')}
        />
      </div>

      <div className="toolbar">
        <button className="primary" onClick={onScanDevices}>
          Scan automatico
        </button>
        <button onClick={onRefreshDevices}>Leer estado</button>
      </div>
    </article>
  )
}

