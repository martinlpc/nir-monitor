import type { LogEntry, NmeaEntry } from './types'

type DebugLogEntry = LogEntry | NmeaEntry

interface DebugLogPanelProps {
  title: string
  entries: DebugLogEntry[]
  emptyMessage: string
  onClear: () => void
  compact?: boolean
}

export default function DebugLogPanel({
  title,
  entries,
  emptyMessage,
  onClear,
  compact = false
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
          entries.map((entry) => {
            const isNmea = entry.kind === 'nmea'
            return (
              <div key={entry.id} className={`log-entry ${isNmea ? 'nmea-entry' : ''}`.trim()}>
                <span className="log-time">{entry.timestamp}</span>
                <span className="log-type">{isNmea ? entry.port : entry.type}</span>
                <span className={`log-message ${isNmea ? 'nmea-line' : ''}`.trim()}>
                  {isNmea ? entry.line : entry.message}
                </span>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

