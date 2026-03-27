import type { LogEntry, NmeaEntry } from './types'

interface DebugLogPanelProps {
  title: string
  entries: LogEntry[] | NmeaEntry[]
  emptyMessage: string
  onClear: () => void
  compact?: boolean
  nmea?: boolean
}

export default function DebugLogPanel({
  title,
  entries,
  emptyMessage,
  onClear,
  compact = false,
  nmea = false
}: DebugLogPanelProps): React.JSX.Element {
  return (
    <section className={`panel ${compact ? 'panel-compact' : ''}`.trim()}>
      <div className="panel-head">
        <h2>{title}</h2>
        <button onClick={onClear}>Limpiar</button>
      </div>

      <div className={`log-list ${compact ? 'log-list-compact' : ''}`.trim()}>
        {entries.length === 0 ? (
          <p className="empty-state">{emptyMessage}</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={`log-entry ${nmea ? 'nmea-entry' : ''}`.trim()}>
              <span className="log-time">{entry.timestamp}</span>
              <span className="log-type">{nmea ? (entry as NmeaEntry).port : (entry as LogEntry).type}</span>
              <span className={`log-message ${nmea ? 'nmea-line' : ''}`.trim()}>
                {nmea ? (entry as NmeaEntry).line : (entry as LogEntry).message}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

