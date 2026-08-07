import { appendFile } from 'fs'
import { join } from 'path'

// Tipos de alerta soportados por el sistema de notificaciones
export type AlertType = 'error' | 'warning' | 'info' | 'done'

export interface AlertLoggerOptions {
  getLogPath: () => string
  appendFile: (
    path: string,
    data: string,
    callback: (err: NodeJS.ErrnoException | null) => void
  ) => void
}

export class AlertLogger {
  constructor(private opts: AlertLoggerOptions) {}

  log(message: string, type: AlertType = 'info'): void {
    const ts = new Date().toISOString()
    const line = `[${ts}] [${type.toUpperCase()}] ${message}\n`
    this.opts.appendFile(this.opts.getLogPath(), line, (err) => {
      if (err) console.error('[AlertLogger] Error writing alert log:', err)
    })
  }
}

let defaultLogger: AlertLogger | undefined

export function getDefaultAlertLogger(): AlertLogger {
  if (defaultLogger) return defaultLogger
  defaultLogger = new AlertLogger({
    getLogPath: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { app } = require('electron') as typeof import('electron')
      return join(app.getPath('userData'), 'alert.log')
    },
    appendFile
  })
  return defaultLogger
}
