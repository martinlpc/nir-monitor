import { AppError } from './AppError'

const KNOWN_PATTERNS = [
  { test: /connect ENOENT|port not found|cannot open/i, msg: 'Puerto serie no encontrado. Verificá la conexión del dispositivo.' },
  { test: /(?:^|[^a-z])ENOENT(?:[^_]|$)|file not found|no such file/i, msg: 'Archivo no encontrado.' },
  { test: /SQLITE_ERROR|database.*(?:error|corrupt|lock)/i, msg: 'Error interno de base de datos. Contactá al soporte técnico.' },
  { test: /EACCES|permission denied/i, msg: 'Permiso denegado para acceder al archivo.' },
  { test: /ENOTFOUND|getaddrinfo/i, msg: 'No se pudo conectar al servidor. Verificá la conexión a internet.' },
  { test: /ECONNREFUSED|connection refused/i, msg: 'Conexión rechazada. Verificá que el servicio esté activo.' },
  { test: /ETIMEDOUT|timeout/i, msg: 'La operación superó el tiempo de espera. Intentá de nuevo.' },
  { test: /session.*not found|not exist/i, msg: 'La sesión solicitada no existe.' },
  { test: /no.*available/i, msg: 'El recurso solicitado no está disponible en este momento.' },
  { test: /invalid session/i, msg: 'ID de sesión inválido.' },
  { test: /format.*invalid|invalid.*format|malformed/i, msg: 'El formato del archivo no es válido.' },
  { test: /correction factor|uncertainty/i, msg: 'Error al procesar el factor de corrección. Verificá la configuración.' },
  { test: /disconnected|not connected/i, msg: 'El dispositivo no está conectado.' },
  { test: /already.*(?:start|connect|exist)/i, msg: 'La operación no se puede realizar porque ya está en curso.' }
]

export function toUserError(err: unknown): { message: string; technical: string } {
  if (err instanceof AppError) {
    const msg = err.userAction
      ? `${err.message}. ${err.userAction}`
      : err.message
    return { message: msg, technical: err.stack ?? err.message }
  }

  if (err instanceof Error) {
    for (const { test, msg } of KNOWN_PATTERNS) {
      if (test.test(err.message)) {
        return { message: msg, technical: err.stack ?? err.message }
      }
    }
    return { message: 'Ocurrió un error inesperado. Revisá la consola para más detalles.', technical: err.stack ?? err.message }
  }

  return { message: 'Ocurrió un error inesperado.', technical: String(err) }
}
