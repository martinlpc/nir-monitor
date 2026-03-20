import { EventEmitter } from 'events'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { GeoFusionService } from './GeoFusionService'
import type { GeoPosition } from '../../shared/GeoTimestamp'

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
  it('captures the first valid point in distance mode', async () => {
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    const service = new GeoFusionService({
      triggerMode: 'distance',
      minDistanceMeters: 10,
      intervalMs: 5000
    })

    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 25, hdop: 0.9 })
    service.setNBM(nbm as never)
    service.setGPS(gps as never)
    service.start('session-1')

    const pointPromise = new Promise<any>((resolve) => service.once('point', resolve))
    service.onGPSPosition(true)
    const point = await pointPromise

    expect(nbm.readMeasurement).toHaveBeenCalledTimes(1)
    expect(nbm.resetMaxHold).toHaveBeenCalledTimes(1)
    expect(point.sessionId).toBe('session-1')
    expect(point.position.lat).toBeCloseTo(-34.6037)
    expect(point.emf.rss).toBe(8.2)
    expect(point.interpolated).toBe(false)
  })

  it('captures repeatedly in time mode when the GPS fix is valid', async () => {
    vi.useFakeTimers()

    const nbm = new FakeNBMDriver({ rss: 4.4, unit: 'V/m', battery: 100 })
    const gps = new FakeGPSDriver()
    const service = new GeoFusionService({
      triggerMode: 'time',
      minDistanceMeters: 10,
      intervalMs: 1000
    })

    gps.setPosition({ lat: -34.6, lon: -58.38, alt: 20, hdop: 1.2 })
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
})
