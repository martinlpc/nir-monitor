import { useEffect, useRef, useState } from 'react'
import './production.css'

interface GPSData {
  timestamp: number
  type: 'nmea' | 'position' | 'error'
  data: string
}

export default function GPSDebugMonitor(): React.JSX.Element {
  const [logs, setLogs] = useState<GPSData[]>([])
  const [isMonitoring, setIsMonitoring] = useState(true)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const logsContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isMonitoring) return

    // Monitorear tramas NMEA
    const unsubNmea = window.api.gps.onNmea((data: { line: string; port: string }) => {
      setLogs((prev) => [
        {
          timestamp: Date.now(),
          type: 'nmea',
          data: `[${data.port}] ${data.line}`
        },
        ...prev.slice(0, 49)
      ])
    })

    // Monitorear posiciones
    const unsubPos = window.api.gps.onPosition(
      (data: {
        coords: { lat: number; lon: number; alt: number; hdop: number } | null
        valid: boolean
      }) => {
        setLogs((prev) => [
          {
            timestamp: Date.now(),
            type: 'position',
            data: data.valid
              ? `✓ Pos: ${data.coords?.lat.toFixed(4)}, ${data.coords?.lon.toFixed(4)}`
              : '✗ Sin fix...'
          },
          ...prev.slice(0, 49)
        ])
      }
    )

    return () => {
      unsubNmea()
      unsubPos()
    }
  }, [isMonitoring])

  const getLogColor = (type: GPSData['type']): string => {
    switch (type) {
      case 'nmea':
        return '#a78bfa'
      case 'position':
        return '#4ade80'
      case 'error':
        return '#f87171'
    }
  }

  return (
    <div className="gps-debug-monitor">
      <div className="monitor-header">
        <h3>GPS Monitor</h3>
        <button className="btn-toggle-monitor" onClick={() => setIsMonitoring(!isMonitoring)}>
          {isMonitoring ? '⏸' : '▶'}
        </button>
      </div>

      <div className="monitor-logs" ref={logsContainerRef}>
        {logs.length === 0 ? (
          <p className="monitor-empty">Esperando datos del GPS...</p>
        ) : (
          logs.map((log, idx) => (
            <div key={idx} className="log-entry" style={{ color: getLogColor(log.type) }}>
              <span className="log-time">
                {new Date(log.timestamp).toLocaleTimeString('es-AR', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  fractionalSecondDigits: 3
                })}
              </span>
              <span className="log-text">{log.data}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      <div className="monitor-stats">
        <small>
          {logs.filter((l) => l.type === 'nmea').length} tramas |
          {logs.filter((l) => l.type === 'position').length} posiciones
        </small>
      </div>
    </div>
  )
}
