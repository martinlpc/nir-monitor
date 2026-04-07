/**
 * Convierte duración en milisegundos a formato HH:MM:SS
 */
export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * Convierte timestamp Unix a hora legible HH:MM:SS
 */
export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

/**
 * Convierte timestamp Unix a fecha y hora completa DD/MM/YYYY HH:MM:SS
 */
export function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}
