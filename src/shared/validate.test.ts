import { describe, it, expect } from 'vitest'
import { isValidSessionId } from './validate'

describe('isValidSessionId', () => {
  it('accepts valid UUID v4', () => {
    expect(isValidSessionId('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('accepts another valid UUID v4', () => {
    expect(isValidSessionId('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidSessionId('')).toBe(false)
  })

  it('rejects non-UUID string', () => {
    expect(isValidSessionId('not-a-uuid')).toBe(false)
  })

  it('rejects UUID v1', () => {
    expect(isValidSessionId('550e8400-e29b-11d4-a716-446655440000')).toBe(false)
  })

  it('rejects UUID v5', () => {
    expect(isValidSessionId('550e8400-e29b-51d4-a716-446655440000')).toBe(false)
  })

  it('rejects partial UUID', () => {
    expect(isValidSessionId('550e8400-e29b-41d4')).toBe(false)
  })

  it('accepts uppercase UUID', () => {
    expect(isValidSessionId('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })
})
