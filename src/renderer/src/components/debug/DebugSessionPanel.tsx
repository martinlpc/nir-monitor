import DebugStat from './DebugStat'
import type { DebugPanelState, TriggerMode } from './types'

interface DebugSessionPanelProps {
  state: DebugPanelState
  onSessionLabelChange: (value: string) => void
  onTriggerModeChange: (value: TriggerMode) => void
  onMinDistanceChange: (value: string) => void
  onIntervalChange: (value: string) => void
  onStartSession: () => void
  onStopSession: () => void
}

export default function DebugSessionPanel({
  state,
  onSessionLabelChange,
  onTriggerModeChange,
  onMinDistanceChange,
  onIntervalChange,
  onStartSession,
  onStopSession
}: DebugSessionPanelProps): React.JSX.Element {
  return (
    <article className="panel">
      <div className="panel-head">
        <h2>Sesion</h2>
      </div>

      <label className="field">
        <span>Etiqueta</span>
        <input value={state.sessionLabel} onChange={(event) => onSessionLabelChange(event.target.value)} />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Trigger</span>
          <select
            value={state.triggerMode}
            onChange={(event) => onTriggerModeChange(event.target.value as TriggerMode)}
          >
            <option value="distance">distance</option>
            <option value="time">time</option>
          </select>
        </label>

        <label className="field">
          <span>{state.triggerMode === 'distance' ? 'Metros' : 'Intervalo ms'}</span>
          <input
            value={state.triggerMode === 'distance' ? state.minDistanceMeters : state.intervalMs}
            onChange={(event) =>
              state.triggerMode === 'distance'
                ? onMinDistanceChange(event.target.value)
                : onIntervalChange(event.target.value)
            }
          />
        </label>
      </div>

      <div className="toolbar">
        <button className="primary" onClick={onStartSession}>
          Iniciar sesion
        </button>
        <button onClick={onStopSession}>Detener sesion</button>
      </div>

      <div className="stats">
        <DebugStat label="Sesion actual" value={state.sessionId ?? 'sin iniciar'} />
        <DebugStat label="Ultimo GPS" value={state.gpsText} />
        <DebugStat
          label="Ultima muestra"
          value={
            state.lastSample
              ? `${state.lastSample.emf.rss} ${state.lastSample.emf.unit} @ ${state.lastSample.position.lat.toFixed(5)}, ${state.lastSample.position.lon.toFixed(5)}`
              : 'sin muestras'
          }
        />
        <DebugStat
          label="Ultimo resumen"
          value={
            state.sessionSummary
              ? `${state.sessionSummary.label} | muestras=${state.sessionSummary.sampleCount}`
              : 'sin resumen'
          }
        />
      </div>
    </article>
  )
}

