import { EventEmitter } from 'events'
import { describe, expect, it } from 'vitest'
import { SessionService } from './SessionService'
import { GeoFusionService } from './GeoFusionService'
import type { GeoPosition } from '../../shared/GeoTimestamp'

class FakeNBMDriver extends EventEmitter {
  private connected = true

  connectState(connected: boolean): void {
    this.connected = connected
  }

  isConnected(): boolean {
    return this.connected
  }

  resetMaxHold(): Promise<void> {
    return Promise.resolve()
  }

  readMeasurement(): Promise<{ rss: number; unit: 'V/m'; battery: number }> {
    return Promise.resolve({ rss: 6.5, unit: 'V/m', battery: 100 })
  }
}

class FakeGPSDriver extends EventEmitter {
  private connected = true
  private position: GeoPosition | null = null
  private valid = false

  connectState(connected: boolean): void {
    this.connected = connected
  }

  isConnected(): boolean {
    return this.connected
  }

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

  emitPosition(): void {
    this.emit('position', this.position, this.valid)
  }
}

describe('SessionService', () => {
  it('requires both devices to be connected before starting', async () => {
    const fusion = new GeoFusionService()
    const session = new SessionService(fusion)
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()

    nbm.connectState(false)
    session.setNBM(nbm as never)
    session.setGPS(gps as never)

    await expect(session.start()).rejects.toThrow('NBM-550 no conectado')
  })

  it('starts a session and counts captured points', async () => {
    const fusion = new GeoFusionService()
    const session = new SessionService(fusion)
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()

    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 22, hdop: 0.8 })

    session.setNBM(nbm as never)
    session.setGPS(gps as never)

    const sessionId = await session.start('Recorrido de prueba', {
      triggerMode: 'distance',
      minDistanceMeters: 1
    })
    const pointPromise = new Promise<any>((resolve) => session.once('point', resolve))

    gps.emitPosition()
    const point = await pointPromise

    expect(point.sessionId).toBe(sessionId)
    expect(session.getState()).toBe('running')

    const summary = await session.stop()

    expect(summary.id).toBe(sessionId)
    expect(summary.label).toBe('Recorrido de prueba')
    expect(summary.sampleCount).toBe(1)
    expect(session.getState()).toBe('stopped')
  })
})
