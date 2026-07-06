import { describe, it, expect } from 'vitest'
import { toUserError } from './toUserError'
import { AppError } from './AppError'

describe('toUserError', () => {
  it('maps connect ENOENT to friendly message', () => {
    const err = new Error('connect ENOENT /dev/ttyUSB0')
    const result = toUserError(err)
    expect(result.message).toBe('Puerto serie no encontrado. Verificá la conexión del dispositivo.')
    expect(result.technical).toContain('connect ENOENT')
  })

  it('maps SQLITE_ERROR to friendly message', () => {
    const err = new Error('SQLITE_ERROR: no such table: sessions')
    const result = toUserError(err)
    expect(result.message).toBe('Error interno de base de datos. Contactá al soporte técnico.')
  })

  it('maps ENOENT to friendly message', () => {
    const err = new Error('ENOENT: no such file or directory')
    const result = toUserError(err)
    expect(result.message).toBe('Archivo no encontrado.')
  })

  it('maps EACCES to friendly message', () => {
    const err = new Error('EACCES: permission denied')
    const result = toUserError(err)
    expect(result.message).toBe('Permiso denegado para acceder al archivo.')
  })

  it('maps ETIMEDOUT to friendly message', () => {
    const err = new Error('ETIMEDOUT: connection timed out')
    const result = toUserError(err)
    expect(result.message).toBe('La operación superó el tiempo de espera. Intentá de nuevo.')
  })

  it('maps session not found to friendly message', () => {
    const err = new Error('Session abc-123 not found')
    const result = toUserError(err)
    expect(result.message).toBe('La sesión solicitada no existe.')
  })

  it('maps invalid session to friendly message', () => {
    const err = new Error('Invalid session id')
    const result = toUserError(err)
    expect(result.message).toBe('ID de sesión inválido.')
  })

  it('maps disconnected to friendly message', () => {
    const err = new Error('NBM device is not connected')
    const result = toUserError(err)
    expect(result.message).toBe('El dispositivo no está conectado.')
  })

  it('handles AppError with userAction', () => {
    const appErr = new AppError({
      code: 'NBM_411',
      message: 'Error de comunicación con la sonda',
      severity: 'error',
      category: 'nbm',
      userAction: 'Verifique el cable de la sonda'
    })
    const result = toUserError(appErr)
    expect(result.message).toBe(
      'Error de comunicación con la sonda. Verifique el cable de la sonda'
    )
  })

  it('handles AppError without userAction', () => {
    const appErr = new AppError({
      code: 'NBM_100',
      message: 'Comando inválido',
      severity: 'error',
      category: 'nbm'
    })
    const result = toUserError(appErr)
    expect(result.message).toBe('Comando inválido')
  })

  it('handles generic Error with unexpected message', () => {
    const err = new Error('Something weird happened')
    const result = toUserError(err)
    expect(result.message).toBe('Ocurrió un error inesperado. Revisá la consola para más detalles.')
  })

  it('handles non-Error throwables', () => {
    const result = toUserError('just a string')
    expect(result.message).toBe('Ocurrió un error inesperado.')
  })

  it('handles null/undefined', () => {
    const result = toUserError(null)
    expect(result.message).toBe('Ocurrió un error inesperado.')
  })
})
