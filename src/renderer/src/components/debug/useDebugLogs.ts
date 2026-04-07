import { useCallback, useState } from 'react'
import type { LogEntry } from './types'

export function useDebugLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([])

  const appendLog = useCallback((type: string, message: string): void => {
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
  }, [])

  const clearLogs = useCallback(() => setLogs([]), [])

  return { logs, appendLog, clearLogs }
}
