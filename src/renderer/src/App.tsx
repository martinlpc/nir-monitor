import { useEffect, useState } from 'react'
import type { DeviceManagerState } from '../../main/services/DeviceManager'
import type { SessionSummary } from '../../shared/ipc.types'
import type { GeoTimestamp } from '../../shared/GeoTimestamp'

type PortInfo = { path: string; manufacturer: string }
type DeviceId = 'nbm550' | 'gps'
type TriggerMode = 'distance' | 'time'

interface LogEntry {
  id: number
  timestamp: string
  type: string
  message: string
}

interface NmeaEntry {
  id: number
  timestamp: string
  port: string
  line: string
}

const INITIAL_DEVICE_STATE: DeviceManagerState = {
  nbm550: { port: null, status: 'disconnected' },
  gps: { port: null, status: 'disconnected' },
  scanning: false
}

function App(): React.JSX.Element {
  const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1'
  return debugEnabled ? <DebugPanel /> : <ProductionShell />
}

function DebugPanel(): React.JSX.Element {
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [deviceState, setDeviceState] = useState<DeviceManagerState>(INITIAL_DEVICE_STATE)
  const [selectedPorts, setSelectedPorts] = useState<Record<DeviceId, string>>({
    nbm550: '',
    gps: ''
  })
  const [sessionLabel, setSessionLabel] = useState('Prueba de campo')
  const [triggerMode, setTriggerMode] = useState<TriggerMode>('distance')
  const [minDistanceMeters, setMinDistanceMeters] = useState('10')
  const [intervalMs, setIntervalMs] = useState('5000')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null)
  const [lastSample, setLastSample] = useState<GeoTimestamp | null>(null)
  const [gpsText, setGpsText] = useState('Sin datos')
  const [nmeaLines, setNmeaLines] = useState<NmeaEntry[]>([])
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])

  const appendLog = (type: string, message: string): void => {
    setLogs((current) =>
      [
        {
          id: Date.now() + Math.random(),
          timestamp: new Date().toLocaleTimeString('es-AR', { hour12: false }),
          type,
          message
        },
        ...current
      ].slice(0, 80)
    )
  }

  const refreshPorts = async (): Promise<void> => {
    const nextPorts = await window.api.ports.list()
    setPorts(nextPorts)
    setSelectedPorts((current) => ({
      nbm550: current.nbm550 || nextPorts[0]?.path || '',
      gps: current.gps || nextPorts[0]?.path || ''
    }))
    appendLog('ports', `Se listaron ${nextPorts.length} puertos`)
  }

  const refreshDevices = async (): Promise<void> => {
    const nextState = await window.api.devices.list()
    setDeviceState(nextState)
    setSelectedPorts((current) => ({
      nbm550: current.nbm550 || nextState.nbm550.port || '',
      gps: current.gps || nextState.gps.port || ''
    }))
  }

  const runAction = async (label: string, action: () => Promise<void>): Promise<void> => {
    setBusyAction(label)
    try {
      await action()
    } catch (error) {
      appendLog('error', error instanceof Error ? error.message : 'Error desconocido')
    } finally {
      setBusyAction(null)
    }
  }

  useEffect(() => {
    void runAction('bootstrap', async () => {
      await refreshPorts()
      await refreshDevices()
    })

    const offStatus = window.api.devices.onStatus((data) => {
      setDeviceState((current) => ({
        ...current,
        [data.deviceId]: {
          ...current[data.deviceId as DeviceId],
          status: data.status as DeviceManagerState[DeviceId]['status']
        }
      }))
      appendLog('device:status', `${data.deviceId} -> ${data.status}`)
    })

    const offError = window.api.devices.onError((data) => {
      appendLog('device:error', `${data.deviceId}: ${data.error}`)
    })

    const offScan = window.api.devices.onScanState((state) => {
      setDeviceState(state)
      appendLog(
        'scan',
        `scan=${state.scanning} nbm=${state.nbm550.port ?? '-'} gps=${state.gps.port ?? '-'}`
      )
    })

    const offGps = window.api.gps.onPosition((data) => {
      if (!data.coords) {
        setGpsText(`GPS ${data.valid ? 'valido' : 'sin fix'}`)
        return
      }

      setGpsText(
        `${data.valid ? 'fix' : 'sin fix'} lat=${data.coords.lat.toFixed(6)} lon=${data.coords.lon.toFixed(6)} alt=${data.coords.alt.toFixed(1)}`
      )
    })

    const offNmea = window.api.gps.onNmea((data) => {
      setNmeaLines((current) =>
        [
          {
            id: Date.now() + Math.random(),
            timestamp: new Date().toLocaleTimeString('es-AR', { hour12: false }),
            port: data.port,
            line: data.line
          },
          ...current
        ].slice(0, 30)
      )
    })

    const offSample = window.api.session.onSample((point) => {
      setLastSample(point)
      appendLog(
        'sample',
        `rss=${point.emf.rss} ${point.emf.unit} @ ${point.position.lat.toFixed(6)}, ${point.position.lon.toFixed(6)}`
      )
    })

    const offStarted = window.api.session.onStarted((data) => {
      setSessionId(data.sessionId)
      setSessionSummary(null)
      appendLog('session:start', `${data.label} (${data.sessionId})`)
    })

    const offStopped = window.api.session.onStopped((data) => {
      setSessionSummary(data)
      setSessionId(null)
      appendLog('session:stop', `${data.label} | muestras=${data.sampleCount}`)
    })

    return () => {
      offStatus()
      offError()
      offScan()
      offGps()
      offNmea()
      offSample()
      offStarted()
      offStopped()
    }
  }, [])

  return (
    <main className="debug-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">nir-monitor</p>
          <h1>Panel de Debug IPC</h1>
          <p className="hero-copy">
            Esta pantalla sirve para validar el wiring real entre renderer, preload, IPC y servicios
            del proceso principal.
          </p>
        </div>
        <div className="hero-meta">
          <span className={`badge ${deviceState.scanning ? 'warn' : 'ok'}`}>
            {deviceState.scanning ? 'Escaneando' : 'Idle'}
          </span>
          <span className={`badge ${sessionId ? 'active' : ''}`}>
            {sessionId ? 'Sesion activa' : 'Sin sesion'}
          </span>
          {busyAction ? <span className="busy">Ejecutando: {busyAction}</span> : null}
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <div className="panel-head">
            <h2>Puertos y Dispositivos</h2>
            <button onClick={() => void runAction('refreshPorts', refreshPorts)}>
              Refrescar puertos
            </button>
          </div>

          <div className="device-grid">
            <DeviceCard
              title="NBM-550"
              state={deviceState.nbm550}
              selectedPort={selectedPorts.nbm550}
              ports={ports}
              onPortChange={(port) => setSelectedPorts((current) => ({ ...current, nbm550: port }))}
              onSetPort={() =>
                runAction('setPort:nbm550', async () => {
                  const state = await window.api.devices.setPort('nbm550', selectedPorts.nbm550)
                  setDeviceState(state)
                  appendLog('device:set-port', `nbm550 -> ${selectedPorts.nbm550}`)
                })
              }
              onConnect={() =>
                runAction('connect:nbm550', async () => {
                  await window.api.devices.connect('nbm550')
                  appendLog('device:connect', 'nbm550')
                })
              }
              onDisconnect={() =>
                runAction('disconnect:nbm550', async () => {
                  await window.api.devices.disconnect('nbm550')
                  await refreshDevices()
                  appendLog('device:disconnect', 'nbm550')
                })
              }
            />

            <DeviceCard
              title="GPS"
              state={deviceState.gps}
              selectedPort={selectedPorts.gps}
              ports={ports}
              onPortChange={(port) => setSelectedPorts((current) => ({ ...current, gps: port }))}
              onSetPort={() =>
                runAction('setPort:gps', async () => {
                  const state = await window.api.devices.setPort('gps', selectedPorts.gps)
                  setDeviceState(state)
                  appendLog('device:set-port', `gps -> ${selectedPorts.gps}`)
                })
              }
              onConnect={() =>
                runAction('connect:gps', async () => {
                  await window.api.devices.connect('gps')
                  appendLog('device:connect', 'gps')
                })
              }
              onDisconnect={() =>
                runAction('disconnect:gps', async () => {
                  await window.api.devices.disconnect('gps')
                  await refreshDevices()
                  appendLog('device:disconnect', 'gps')
                })
              }
            />
          </div>

          <div className="toolbar">
            <button
              className="primary"
              onClick={() =>
                void runAction('scan', async () => {
                  const state = await window.api.devices.scan()
                  setDeviceState(state)
                  setSelectedPorts({
                    nbm550: state.nbm550.port ?? selectedPorts.nbm550,
                    gps: state.gps.port ?? selectedPorts.gps
                  })
                  appendLog('scan', 'Escaneo manual completado')
                })
              }
            >
              Scan automatico
            </button>
            <button
              onClick={() =>
                void runAction('devices.list', async () => {
                  await refreshDevices()
                  appendLog('device:list', 'Estado actualizado')
                })
              }
            >
              Leer estado
            </button>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Sesion</h2>
          </div>

          <label className="field">
            <span>Etiqueta</span>
            <input value={sessionLabel} onChange={(event) => setSessionLabel(event.target.value)} />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Trigger</span>
              <select
                value={triggerMode}
                onChange={(event) => setTriggerMode(event.target.value as TriggerMode)}
              >
                <option value="distance">distance</option>
                <option value="time">time</option>
              </select>
            </label>

            <label className="field">
              <span>{triggerMode === 'distance' ? 'Metros' : 'Intervalo ms'}</span>
              <input
                value={triggerMode === 'distance' ? minDistanceMeters : intervalMs}
                onChange={(event) =>
                  triggerMode === 'distance'
                    ? setMinDistanceMeters(event.target.value)
                    : setIntervalMs(event.target.value)
                }
              />
            </label>
          </div>

          <div className="toolbar">
            <button
              className="primary"
              onClick={() =>
                void runAction('session.start', async () => {
                  const nextSessionId = await window.api.session.start({
                    label: sessionLabel,
                    triggerMode,
                    minDistanceMeters: Number(minDistanceMeters),
                    intervalMs: Number(intervalMs)
                  })
                  setSessionId(nextSessionId)
                })
              }
            >
              Iniciar sesion
            </button>
            <button
              onClick={() =>
                void runAction('session.stop', async () => {
                  const summary = await window.api.session.stop()
                  setSessionSummary(summary)
                  setSessionId(null)
                })
              }
            >
              Detener sesion
            </button>
          </div>

          <div className="stats">
            <Stat label="Sesion actual" value={sessionId ?? 'sin iniciar'} />
            <Stat label="Ultimo GPS" value={gpsText} />
            <Stat
              label="Ultima trama NMEA"
              value={nmeaLines[0] ? `${nmeaLines[0].port} | ${nmeaLines[0].line}` : 'sin tramas'}
            />
            <Stat
              label="Ultima muestra"
              value={
                lastSample
                  ? `${lastSample.emf.rss} ${lastSample.emf.unit} @ ${lastSample.position.lat.toFixed(5)}, ${lastSample.position.lon.toFixed(5)}`
                  : 'sin muestras'
              }
            />
            <Stat
              label="Ultimo resumen"
              value={
                sessionSummary
                  ? `${sessionSummary.label} | muestras=${sessionSummary.sampleCount}`
                  : 'sin resumen'
              }
            />
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Eventos</h2>
          <button onClick={() => setLogs([])}>Limpiar</button>
        </div>

        <div className="log-list">
          {logs.length === 0 ? (
            <p className="empty-state">Todavia no llegaron eventos.</p>
          ) : (
            logs.map((entry) => (
              <div key={entry.id} className="log-entry">
                <span className="log-time">{entry.timestamp}</span>
                <span className="log-type">{entry.type}</span>
                <span className="log-message">{entry.message}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>NMEA crudo</h2>
          <button onClick={() => setNmeaLines([])}>Limpiar</button>
        </div>

        <div className="log-list">
          {nmeaLines.length === 0 ? (
            <p className="empty-state">Todavia no llegaron sentencias NMEA.</p>
          ) : (
            nmeaLines.map((entry) => (
              <div key={entry.id} className="log-entry nmea-entry">
                <span className="log-time">{entry.timestamp}</span>
                <span className="log-type">{entry.port}</span>
                <span className="log-message nmea-line">{entry.line}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  )
}

function ProductionShell(): React.JSX.Element {
  return (
    <main className="prod-shell">
      <section className="prod-card">
        <p className="eyebrow">nir-monitor</p>
        <h1>Aplicacion operativa</h1>
        <p className="hero-copy">
          El panel interno de diagnostico no esta habilitado en esta compilacion.
        </p>
      </section>
    </main>
  )
}

function DeviceCard({
  title,
  state,
  selectedPort,
  ports,
  onPortChange,
  onSetPort,
  onConnect,
  onDisconnect
}: {
  title: string
  state: DeviceManagerState['nbm550']
  selectedPort: string
  ports: PortInfo[]
  onPortChange: (port: string) => void
  onSetPort: () => void
  onConnect: () => void
  onDisconnect: () => void
}): React.JSX.Element {
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

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default App
