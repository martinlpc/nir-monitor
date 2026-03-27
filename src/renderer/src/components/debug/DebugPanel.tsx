import MapView from '../map/MapView'
import DebugDevicesPanel from './DebugDevicesPanel'
import DebugHero from './DebugHero'
import DebugLogPanel from './DebugLogPanel'
import DebugSessionPanel from './DebugSessionPanel'
import { useDebugPanelState } from './useDebugPanelState'

export default function DebugPanel(): React.JSX.Element {
  const { state, actions } = useDebugPanelState()

  return (
    <main className="debug-shell">
      <DebugHero
        scanning={state.deviceState.scanning}
        gpsFix={state.gpsFix}
        sessionId={state.sessionId}
        busyAction={state.busyAction}
      />

      <section className="grid">
        <DebugDevicesPanel
          state={state}
          onRefreshPorts={() => void actions.refreshPorts()}
          onScanDevices={() => void actions.scanDevices()}
          onRefreshDevices={() => void actions.refreshDevices()}
          onSetSelectedPort={actions.setSelectedPort}
          onSetPort={(deviceId) => void actions.setPort(deviceId)}
          onConnectDevice={(deviceId) => void actions.connectDevice(deviceId)}
          onDisconnectDevice={(deviceId) => void actions.disconnectDevice(deviceId)}
        />

        <DebugSessionPanel
          state={state}
          onSessionLabelChange={actions.setSessionLabel}
          onTriggerModeChange={actions.setTriggerMode}
          onMinDistanceChange={actions.setMinDistanceMeters}
          onIntervalChange={actions.setIntervalMs}
          onStartSession={() => void actions.startSession()}
          onStopSession={() => void actions.stopSession()}
        />
      </section>

      <DebugLogPanel
        title="Eventos"
        entries={state.logs}
        emptyMessage="Todavia no llegaron eventos."
        onClear={actions.clearLogs}
      />

      <DebugLogPanel
        title="NMEA crudo"
        entries={state.nmeaLines}
        emptyMessage="Todavia no llegaron sentencias NMEA."
        onClear={actions.clearNmeaLines}
        compact
        nmea
      />

      <section className="panel">
        <MapView />
      </section>
    </main>
  )
}

