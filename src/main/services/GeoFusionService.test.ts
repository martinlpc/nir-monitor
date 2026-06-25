import { EventEmitter } from 'events'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { GeoFusionService } from './GeoFusionService'
import type { GeoPosition, GeoTimestamp } from '../../shared/GeoTimestamp'

class FakeNBMDriver {
  constructor(private readonly sample = { rss: 8.2, unit: 'V/m', battery: 100 }) {}

  readMeasurement = vi.fn(async () => this.sample)
  resetMaxHold = vi.fn(async () => {})
}

class FakeGPSDriver extends EventEmitter {
  private position: GeoPosition | null = null
  private valid = false

  setPosition(position: GeoPosition, valid = true): void {
    this.position = position
    this.valid = valid
  }

  getLastPosition(): GeoPosition | null {
    return this.position
  }

  isPositionValid(): boolean {
    return this.valid
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('GeoFusionService', () => {
  it('updateConfig ignores undefined values', () => {
    const service = new GeoFusionService({
      triggerMode: 'distance',
      minDistanceMeters: 10,
      intervalMs: 5000
    })

    service.updateConfig({
      triggerMode: 'time',
      minDistanceMeters: undefined,
      intervalMs: undefined
    })

    expect(service['config'].triggerMode).toBe('time')
    expect(service['config'].minDistanceMeters).toBe(10)
    expect(service['config'].intervalMs).toBe(5000)
  })
  it('captures the first valid point in distance mode', async () => {
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    const service = new GeoFusionService({
      triggerMode: 'distance',
      minDistanceMeters: 10,
      intervalMs: 5000
    })

    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 25 })
    service.setNBM(nbm as never)
    service.setGPS(gps as never)
    service.start('session-1')

    const pointPromise = new Promise<GeoTimestamp>((resolve) => service.once('point', resolve))
    service.onGPSPosition(true)
    const point = await pointPromise

    expect(nbm.readMeasurement).toHaveBeenCalledTimes(1)
    expect(nbm.resetMaxHold).toHaveBeenCalledTimes(1)
    expect(point.sessionId).toBe('session-1')
    expect(point.position.lat).toBeCloseTo(-34.6037)
    expect(point.emf.rawMeasurement).toBe(8.2)
    expect(point.sequenceNumber).toBe(1)
    expect(point.correctedMeasurement).toBe(8.2) // sin factor de corrección por defecto
  })

  it('applies correction factor to the measurement', async () => {
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    const service = new GeoFusionService({
      triggerMode: 'distance',
      minDistanceMeters: 10,
      intervalMs: 5000
    })

    service.setCorrectionFactor(1.5)
    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 25 })
    service.setNBM(nbm as never)
    service.setGPS(gps as never)
    service.start('session-cf')

    const pointPromise = new Promise<GeoTimestamp>((resolve) => service.once('point', resolve))
    service.onGPSPosition(true)
    const point = await pointPromise

    expect(point.correctedMeasurement).toBeCloseTo(8.2 * 1.5, 2)
  })

  it('skips capture when distance threshold is not met', async () => {
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    const service = new GeoFusionService({
      triggerMode: 'distance',
      minDistanceMeters: 100,
      intervalMs: 5000
    })

    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 25 })
    service.setNBM(nbm as never)
    service.setGPS(gps as never)
    service.start('session-dist')

    // First point always captured
    const point1Promise = new Promise<GeoTimestamp>((resolve) => service.once('point', resolve))
    service.onGPSPosition(true)
    await point1Promise
    expect(nbm.readMeasurement).toHaveBeenCalledTimes(1)

    // Same position — should NOT capture (only ~3m, threshold is 100m)
    nbm.readMeasurement.mockClear()
    const point2Listener = vi.fn()
    service.on('point', point2Listener)
    service.onGPSPosition(true)
    // Pequeña espera para que se procese el trigger
    await new Promise((r) => setTimeout(r, 10))
    expect(point2Listener).not.toHaveBeenCalled()
    expect(nbm.readMeasurement).not.toHaveBeenCalled()
  })

  it('captures again after moving past the distance threshold', async () => {
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    const service = new GeoFusionService({
      triggerMode: 'distance',
      minDistanceMeters: 10,
      intervalMs: 5000
    })

    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 25 })
    service.setNBM(nbm as never)
    service.setGPS(gps as never)
    service.start('session-dist2')

    // First point
    const p1 = new Promise<GeoTimestamp>((resolve) => service.once('point', resolve))
    service.onGPSPosition(true)
    await p1
    expect(nbm.readMeasurement).toHaveBeenCalledTimes(1)

    nbm.readMeasurement.mockClear()

    // Move ~11km south — well past 10m threshold
    gps.setPosition({ lat: -34.7, lon: -58.38, alt: 25 })
    const p2 = new Promise<GeoTimestamp>((resolve) => service.once('point', resolve))
    service.onGPSPosition(true)
    await p2

    expect(nbm.readMeasurement).toHaveBeenCalledTimes(1)
  })

  it('captures every GPS position in testMode', async () => {
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    const service = new GeoFusionService({
      triggerMode: 'distance',
      minDistanceMeters: 1000,
      intervalMs: 5000,
      testMode: true
    })

    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 25 })
    service.setNBM(nbm as never)
    service.setGPS(gps as never)
    service.start('session-test')

    const points: unknown[] = []
    service.on('point', (p) => points.push(p))

    // Same position twice — testMode ignores distance threshold
    service.onGPSPosition(true)
    await new Promise((r) => setTimeout(r, 10))
    service.onGPSPosition(true)
    await new Promise((r) => setTimeout(r, 10))

    expect(points).toHaveLength(2)
  })

  it('stop() clears the time-based timer', async () => {
    vi.useFakeTimers()
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    const service = new GeoFusionService({
      triggerMode: 'time',
      minDistanceMeters: 0,
      intervalMs: 1000
    })

    gps.setPosition({ lat: -34.6, lon: -58.38, alt: 20 })
    service.setNBM(nbm as never)
    service.setGPS(gps as never)
    service.start('session-stop')

    const points: unknown[] = []
    service.on('point', (p) => points.push(p))

    await vi.advanceTimersByTimeAsync(1100)
    expect(points).toHaveLength(1)

    service.stop()

    await vi.advanceTimersByTimeAsync(3000)
    // No more captures after stop
    expect(points).toHaveLength(1)
  })

  it('skips capture when GPS fix is invalid', async () => {
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    const service = new GeoFusionService({
      triggerMode: 'distance',
      minDistanceMeters: 10,
      intervalMs: 5000
    })

    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 25 }, false)
    service.setNBM(nbm as never)
    service.setGPS(gps as never)
    service.start('session-nofix')

    const pointListener = vi.fn()
    service.on('point', pointListener)
    service.onGPSPosition(false)

    await new Promise((r) => setTimeout(r, 10))
    expect(pointListener).not.toHaveBeenCalled()
  })

  it('skips capture when NBM is missing', async () => {
    const gps = new FakeGPSDriver()
    const service = new GeoFusionService({
      triggerMode: 'distance',
      minDistanceMeters: 10,
      intervalMs: 5000
    })

    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 25 })
    service.setGPS(gps as never)
    service.start('session-nonbm')

    const pointListener = vi.fn()
    service.on('point', pointListener)
    service.onGPSPosition(true)

    await new Promise((r) => setTimeout(r, 10))
    expect(pointListener).not.toHaveBeenCalled()
  })

  it('captures repeatedly in time mode when the GPS fix is valid', async () => {
    vi.useFakeTimers()

    const nbm = new FakeNBMDriver({ rss: 4.4, unit: 'V/m', battery: 100 })
    const gps = new FakeGPSDriver()
    const service = new GeoFusionService({
      triggerMode: 'time',
      minDistanceMeters: 0,
      intervalMs: 1000
    })

    gps.setPosition({ lat: -34.6, lon: -58.38, alt: 20 })
    service.setNBM(nbm as never)
    service.setGPS(gps as never)
    service.start('session-2')

    const points: unknown[] = []
    service.on('point', (point) => points.push(point))

    await vi.advanceTimersByTimeAsync(2100)

    expect(points).toHaveLength(2)
    expect(nbm.readMeasurement).toHaveBeenCalledTimes(2)
    expect(nbm.resetMaxHold).toHaveBeenCalledTimes(2)
  })

  // ── NMEA timestamp ──

  it('uses nmeaUtcMs as the point timestamp when present', async () => {
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    const service = new GeoFusionService({
      triggerMode: 'distance',
      minDistanceMeters: 10,
      intervalMs: 5000
    })

    const nmeaTimestamp = Date.UTC(2026, 5, 25, 12, 35, 19)

    gps.setPosition({
      lat: -34.6037,
      lon: -58.3816,
      alt: 25,
      nmeaUtcMs: nmeaTimestamp
    })
    service.setNBM(nbm as never)
    service.setGPS(gps as never)
    service.start('session-nmea')

    const pointPromise = new Promise<GeoTimestamp>((resolve) => service.once('point', resolve))
    service.onGPSPosition(true)
    const point = await pointPromise

    expect(point.timestamp).toBe(nmeaTimestamp)
  })

  it('falls back to Date.now() when nmeaUtcMs is not present', async () => {
    vi.useFakeTimers()
    const fixedDate = new Date('2025-06-15T10:30:00Z')
    vi.setSystemTime(fixedDate)

    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    const service = new GeoFusionService({
      triggerMode: 'distance',
      minDistanceMeters: 10,
      intervalMs: 5000
    })

    // Posición sin nmeaUtcMs
    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 25 })
    service.setNBM(nbm as never)
    service.setGPS(gps as never)
    service.start('session-fallback')

    const pointPromise = new Promise<GeoTimestamp>((resolve) => service.once('point', resolve))
    service.onGPSPosition(true)
    const point = await pointPromise

    expect(point.timestamp).toBe(fixedDate.getTime())
    vi.useRealTimers()
  })
})
