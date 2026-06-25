import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { GPSDriver } from './GPSDriver'

const { readlineListeners } = vi.hoisted(() => {
  const readlineListeners: Record<string, Array<(...args: unknown[]) => void>> = {}
  return { readlineListeners }
})

vi.mock('serialport', () => {
  const lineParser = {
    on(event: string, fn: (...args: unknown[]) => void) {
      if (!readlineListeners[event]) readlineListeners[event] = []
      readlineListeners[event].push(fn)
    },
    removeAllListeners(): void {
      /* no-op mock */
    }
  }

  return {
    SerialPort: function FakeSerialPort() {
      return {
        pipe: () => lineParser,
        open: (cb: (err?: Error | null) => void) => cb(null),
        on: () => undefined,
        isOpen: true,
        close: (cb: () => void) => cb()
      }
    }
  }
})

// NO mockear nmea-simple — queremos el parser real

function createDriver(gpsPort = 'COM3'): GPSDriver {
  return new GPSDriver({ port: gpsPort, baudRate: 4800 })
}

function emitNMEA(line: string): void {
  readlineListeners.data?.forEach((fn) => fn(line))
}

beforeEach(() => {
  Object.keys(readlineListeners).forEach((k) => delete readlineListeners[k])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GPSDriver NMEA timestamp — end-to-end', () => {
  it('nmeaTimestamp se toma de la trama RMC, no del reloj del sistema', async () => {
    vi.useFakeTimers()
    // El PC/tablet tiene el reloj en 2020 (desactualizado)
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))

    const driver = createDriver()
    await driver.connect()

    // RMC real: 25/06/2026 12:35:19 UTC
    emitNMEA('$GPRMC,123519.00,A,3403.453,S,05822.302,W,12.5,154.6,250626,003.1,W*75')
    // GGA real para que exista posición
    emitNMEA('$GPGGA,123519,4807.038,S,01131.000,W,1,08,0.9,545.4,M,46.9,M,,*48')

    const state = driver.getState()
    const pos = driver.getLastPosition()

    // 25/06/2026 12:35:19 UTC
    const expectedMs = Date.UTC(2026, 5, 25, 12, 35, 19)

    expect(state.nmeaTimestamp).toBe(expectedMs)
    expect(pos?.nmeaUtcMs).toBe(expectedMs)

    // Explícitamente NO es Date.now() (que devuelve 2020 por el fake timer)
    expect(state.nmeaTimestamp).not.toBe(Date.now())
    expect(pos?.nmeaUtcMs).not.toBe(Date.now())
  })

  it('GGA sola no produce nmeaTimestamp (timestamp solo viene de RMC)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))

    const driver = createDriver()
    await driver.connect()

    // Solo GGA, sin RMC
    emitNMEA('$GPGGA,123519,4807.038,S,01131.000,W,1,08,0.9,545.4,M,46.9,M,,*48')

    const state = driver.getState()
    expect(state.nmeaTimestamp).toBeNull()

    const pos = driver.getLastPosition()
    // Con GGA hay posición, pero sin RMC no hay timestamp NMEA
    expect(pos).not.toBeNull()
    expect(pos?.nmeaUtcMs).toBeUndefined()
  })

  it('RMC + GGA emite position con nmeaUtcMs en el evento', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))

    const driver = createDriver()
    await driver.connect()

    const positionSpy = vi.fn()
    driver.on('position', positionSpy)

    emitNMEA('$GPRMC,123519.00,A,3403.453,S,05822.302,W,12.5,154.6,250626,003.1,W*75')
    emitNMEA('$GPGGA,123519,4807.038,S,01131.000,W,1,08,0.9,545.4,M,46.9,M,,*48')

    const expectedMs = Date.UTC(2026, 5, 25, 12, 35, 19)

    expect(positionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ nmeaUtcMs: expectedMs }),
      true
    )
  })
})
