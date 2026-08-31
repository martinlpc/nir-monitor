import { describe, expect, it } from 'vitest'
import { validateCanStart } from '../SessionValidator'
import { AppError } from '../../../shared/errors/AppError'

function fakeDriver(connected: boolean, positionValid = true): any {
  return {
    isConnected: () => connected,
    isPositionValid: () => positionValid
  }
}

describe('validateCanStart', () => {
  it('throws when session is already running', () => {
    expect(() => validateCanStart('running', fakeDriver(true), fakeDriver(true))).toThrow(AppError)
  })

  it('throws when NBM is not connected', () => {
    expect(() => validateCanStart('idle', fakeDriver(false), fakeDriver(true))).toThrow(AppError)
  })

  it('throws when GPS is not connected', () => {
    expect(() => validateCanStart('idle', fakeDriver(true), fakeDriver(false))).toThrow(AppError)
  })

  it('throws when GPS has no fix', () => {
    expect(() =>
      validateCanStart('idle', fakeDriver(true), fakeDriver(true, false))
    ).toThrow(AppError)
  })

  it('passes when all conditions are met', () => {
    expect(() => validateCanStart('idle', fakeDriver(true), fakeDriver(true))).not.toThrow()
  })
})
