import type { DeviceManagerStateDTO } from '../../../../shared/dto'
import type { PortInfo } from './types'

interface DebugDeviceCardProps {
  title: string
  state: DeviceManagerStateDTO['nbm550']
  selectedPort: string
  ports: PortInfo[]
  onPortChange: (port: string) => void
  onSetPort: () => void
  onConnect: () => void
  onDisconnect: () => void
}

export default function DebugDeviceCard({
  title,
  state,
  selectedPort,
  ports,
  onPortChange,
  onSetPort,
  onConnect,
  onDisconnect
}: DebugDeviceCardProps): React.JSX.Element {
  return (
    <div className="device-card">
      <div className="device-header">
        <h3>{title}</h3>
        <span
          className={`badge ${state.status === 'connected' ? 'ok' : state.status === 'error' ? 'danger' : ''}`}
        >
          {state.status}
        </span>
      </div>

      <p className="device-port">Puerto actual: {state.port ?? 'sin asignar'}</p>

      <label className="field">
        <span>Puerto manual</span>
        <select value={selectedPort} onChange={(event) => onPortChange(event.target.value)}>
          <option value="">Seleccionar puerto</option>
          {ports.map((port) => (
            <option key={port.path} value={port.path}>
              {port.path} {port.manufacturer ? `| ${port.manufacturer}` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="toolbar compact">
        <button onClick={onSetPort} disabled={!selectedPort}>
          Set port
        </button>
        <button onClick={onConnect}>Connect</button>
        <button onClick={onDisconnect}>Disconnect</button>
      </div>
    </div>
  )
}

