import { describe, expect, it } from 'vitest'
import { evaluateTrigger, buildGeoTimestamp } from '../FusionEngine'
import type { GeoPosition } from '../../../../shared/GeoTimestamp'

const POS_A: GeoPosition = { lat: -34.6037, lon: -58.3816, alt: 25 }
const POS_B: GeoPosition = { lat: -34.7, lon: -58.38, alt: 25 }

describe('evaluateTrigger', () => {
  it('returns false when currentPosition is null', () => {
    expect(evaluateTrigger(null, POS_A, { minDistanceMeters: 10 })).toBe(false)
  })

  it('returns true for first valid position (no lastSavedPosition)', () => {
    expect(evaluateTrigger(POS_A, null, { minDistanceMeters: 10 })).toBe(true)
  })

  it('returns false when distance is below threshold', () => {
    // POS_A vs itself = 0m
    expect(evaluateTrigger(POS_A, POS_A, { minDistanceMeters: 10 })).toBe(false)
  })

  it('returns true when distance meets threshold', () => {
    // POS_A to POS_B ~10.7km — well past 10m
    expect(evaluateTrigger(POS_B, POS_A, { minDistanceMeters: 10 })).toBe(true)
  })

  it('returns true in testMode regardless of distance', () => {
    expect(evaluateTrigger(POS_A, POS_A, { minDistanceMeters: 1000, testMode: true })).toBe(true)
  })
})

describe('buildGeoTimestamp', () => {
  it('creates a point with corrected measurement', () => {
    const point = buildGeoTimestamp({
      sessionId: 'sess-1',
      sequenceNumber: 1,
      position: POS_A,
      sample: { rss: 8.2, unit: 'V/m' },
      correctionFactor: 1.5,
      gpsWasLost: false
    })

    expect(point.id).toBeDefined()
    expect(point.sessionId).toBe('sess-1')
    expect(point.sequenceNumber).toBe(1)
    expect(point.position.lat).toBeCloseTo(-34.6037)
    expect(point.emf.rawMeasurement).toBe(8.2)
    expect(point.emf.unit).toBe('V/m')
    expect(point.correctedMeasurement).toBeCloseTo(12.3, 2)
    expect(point.gpsGap).toBeUndefined()
  })

  it('sets gpsGap when gpsWasLost is true', () => {
    const point = buildGeoTimestamp({
      sessionId: 'sess-2',
      sequenceNumber: 2,
      position: POS_B,
      sample: { rss: 5.0, unit: 'V/m' },
      correctionFactor: 1.0,
      gpsWasLost: true
    })

    expect(point.gpsGap).toBe(true)
  })

  it('uses nmeaUtcMs as timestamp when present', () => {
    const nmeaTs = Date.UTC(2026, 5, 25, 12, 35, 19)
    const position: GeoPosition = { ...POS_A, nmeaUtcMs: nmeaTs }

    const point = buildGeoTimestamp({
      sessionId: 'sess-3',
      sequenceNumber: 3,
      position,
      sample: { rss: 3.0, unit: 'V/m' },
      correctionFactor: 1.0,
      gpsWasLost: false
    })

    expect(point.timestamp).toBe(nmeaTs)
  })

  it('falls back to Date.now() when nmeaUtcMs is absent', () => {
    const before = Date.now()
    const point = buildGeoTimestamp({
      sessionId: 'sess-4',
      sequenceNumber: 4,
      position: POS_A,
      sample: { rss: 2.0, unit: 'V/m' },
      correctionFactor: 1.0,
      gpsWasLost: false
    })
    const after = Date.now()

    expect(point.timestamp).toBeGreaterThanOrEqual(before)
    expect(point.timestamp).toBeLessThanOrEqual(after)
  })
})
