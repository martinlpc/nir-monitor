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

export function createAlertLogger(userDataPath: string): AlertLogger {
  return new AlertLogger({
    getLogPath: () => join(userDataPath, 'alert.log'),
    appendFile
  })
}
