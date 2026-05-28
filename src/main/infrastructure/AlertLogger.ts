import { appendFile } from 'fs'
import { join } from 'path'
import { app } from 'electron'

// Tipos de alerta soportados por el sistema de notificaciones
export type AlertType = 'error' | 'warning' | 'info' | 'done'

export class AlertLogger {
  /**
   * Ejemplo de uso:
   *   AlertLogger.log('Exportación completada con éxito', 'done')
   *   AlertLogger.log('Archivo guardado', 'info')
   *   AlertLogger.log('No hay conexión con el GPS', 'warning')
   *   AlertLogger.log('Error al exportar CSV', 'error')
   */
  private static getLogPath(): string {
    // Carpeta de datos del usuario (cross-platform)
    const userData = app.getPath('userData')
    return join(userData, 'alert.log')
  }

  static log(message: string, type: AlertType = 'info'): void {
    const ts = new Date().toISOString()
    const line = `[${ts}] [${type.toUpperCase()}] ${message}\n`
    appendFile(this.getLogPath(), line, (err) => {
      if (err) console.error('[AlertLogger] Error writing alert log:', err)
    })
  }
}
