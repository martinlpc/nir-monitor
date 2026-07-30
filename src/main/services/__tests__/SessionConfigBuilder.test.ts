import { describe, expect, it } from 'vitest'
import { buildFusionConfig } from '../SessionConfigBuilder'

describe('buildFusionConfig', () => {
  it('returns undefined when no config is set', () => {
    expect(buildFusionConfig({})).toBeUndefined()
  })

  it('merges triggerMode from appConfig', () => {
    const result = buildFusionConfig({ triggerMode: 'time' })
    expect(result?.triggerMode).toBe('time')
  })

  it('overrides appConfig with explicit overrides', () => {
    const result = buildFusionConfig(
      { triggerMode: 'time', minDistanceMeters: 50 },
      { triggerMode: 'distance', minDistanceMeters: 20 }
    )
    expect(result?.triggerMode).toBe('distance')
    expect(result?.minDistanceMeters).toBe(20)
  })

  it('converts testMode to time-based trigger', () => {
    const result = buildFusionConfig({}, { testMode: true })
    expect(result?.triggerMode).toBe('time')
    expect(result?.testMode).toBe(true)
    expect(result?.intervalMs).toBe(5000)
  })

  it('preserves intervalMs when testMode is set with explicit interval', () => {
    const result = buildFusionConfig({}, { testMode: true, intervalMs: 3000 })
    expect(result?.triggerMode).toBe('time')
    expect(result?.intervalMs).toBe(3000)
  })

  it('picks appConfig interval when no override provided', () => {
    const result = buildFusionConfig({ intervalMs: 10000 })
    expect(result?.intervalMs).toBe(10000)
  })
})
