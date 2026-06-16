import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { GPSDriver } from './GPSDriver'

const { readlineListeners, portListeners, mockSerialPort, mockParseNmeaSentence } = vi.hoisted(
  () => {
    const readlineListeners: Record<string, Array<(...args: unknown[]) => void>> = {}
    const portListeners: Record<string, Array<(...args: unknown[]) => void>> = {}
    const mockSerialPort = vi.fn()
    const mockParseNmeaSentence = vi.fn()

    return { readlineListeners, portListeners, mockSerialPort, mockParseNmeaSentence }
  }
)

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
      mockSerialPort()
      return {
        pipe: () => lineParser,
        open: (cb: (err?: Error | null) => void) => cb(null),
        on: (event: string, fn: (...args: unknown[]) => void) => {
          if (!portListeners[event]) portListeners[event] = []
          portListeners[event].push(fn)
        },
        isOpen: true,
        close: (cb: () => void) => {
          portListeners.close?.forEach((fn) => fn())
          cb()
        }
      }
    }
  }
})

vi.mock('nmea-simple', () => ({
  parseNmeaSentence: (...args: unknown[]) => mockParseNmeaSentence(...args)
}))

function createDriver(gpsPort = 'COM3'): GPSDriver {
  return new GPSDriver({ port: gpsPort, baudRate: 4800 })
}

function emitNMEA(line: string): void {
  readlineListeners.data?.forEach((fn) => fn(line))
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.keys(readlineListeners).forEach((k) => delete readlineListeners[k])
  Object.keys(portListeners).forEach((k) => delete portListeners[k])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GPSDriver', () => {
  // ── Connect / Disconnect ──

  it('connect opens the serial port and marks as connected', async () => {
    const driver = createDriver()
    await driver.connect()
    expect(driver.status).toBe('connected')
    expect(mockSerialPort).toHaveBeenCalledOnce()
  })

  it('disconnect resets state and closes port', async () => {
    const driver = createDriver()
    await driver.connect()
    await driver.disconnect()

    expect(driver.status).toBe('disconnected')
    expect(driver.getState()).toMatchObject({
      position: null,
      valid: false,
      fixType: 'none',
      satelliteCount: 0,
      speed: 0,
      heading: 0
    })
  })

  it('isConnected returns true only when connected and port is open', async () => {
    const driver = createDriver()
    expect(driver.isConnected()).toBe(false)
    await driver.connect()
    expect(driver.isConnected()).toBe(true)
    await driver.disconnect()
    expect(driver.isConnected()).toBe(false)
  })

  // ── NMEA: GGA ──

  it('GGA with valid fix updates position, satellites, and emits position event', async () => {
    const driver = createDriver()
    await driver.connect()
    const positionSpy = vi.fn()
    driver.on('position', positionSpy)

    mockParseNmeaSentence.mockReturnValueOnce({
      sentenceId: 'GGA',
      fixType: '3D',
      latitude: -34.6037,
      longitude: -58.3816,
      altitudeMeters: 25,
      horizontalDilution: 0.9,
      satellitesInView: 8
    })

    emitNMEA('$GPGGA,123519,4807.038,S,01131.000,W,1,08,0.9,545.4,M,46.9,M,,*47')

    expect(driver.getLastPosition()).toEqual({
      lat: -34.6037,
      lon: -58.3816,
      alt: 25,
      hdop: 0.9
    })
    expect(driver.isPositionValid()).toBe(true)
    expect(positionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ lat: -34.6037, lon: -58.3816 }),
      true
    )
    expect(driver.getState().satelliteCount).toBe(8)
  })

  it('GGA with no fix marks position as invalid and emits with null', async () => {
    const driver = createDriver()
    await driver.connect()
    const positionSpy = vi.fn()
    driver.on('position', positionSpy)

    mockParseNmeaSentence.mockReturnValueOnce({
      sentenceId: 'GGA',
      fixType: 'none',
      latitude: 0,
      longitude: 0,
      altitudeMeters: 0,
      horizontalDilution: 0,
      satellitesInView: 0
    })

    emitNMEA('$GPGGA,123519,,,,,0,,,M,,M,,*42')

    expect(driver.isPositionValid()).toBe(false)
    expect(positionSpy).toHaveBeenCalledWith(null, false)
  })

  // ── NMEA: RMC ──

  it('RMC updates speed and heading', async () => {
    const driver = createDriver()
    await driver.connect()

    mockParseNmeaSentence
      .mockReturnValueOnce({
        sentenceId: 'GGA',
        fixType: '3D',
        latitude: -34.6037,
        longitude: -58.3816,
        altitudeMeters: 25,
        horizontalDilution: 0.9,
        satellitesInView: 8
      })
      .mockReturnValueOnce({
        sentenceId: 'RMC',
        status: 'valid',
        speedKnots: 10.8,
        trackTrue: 180.5
      })

    emitNMEA('$GPGGA,...')
    emitNMEA('$GPRMC,...')

    const state = driver.getState()
    expect(state.speed).toBeCloseTo(20.0, 0) // 10.8 nudos * 1.852 ≈ 20 km/h
    expect(state.heading).toBe(180.5)
  })

  // ── NMEA: GSA ──

  it('GSA updates fix type to 2D, 3D or none', async () => {
    const driver = createDriver()
    await driver.connect()

    mockParseNmeaSentence.mockReturnValueOnce({ sentenceId: 'GSA', fixMode: '3D' })
    emitNMEA('$GPGSA,A,3,...')
    expect(driver.getState().fixType).toBe('3d')

    mockParseNmeaSentence.mockReturnValueOnce({ sentenceId: 'GSA', fixMode: '2D' })
    emitNMEA('$GPGSA,A,2,...')
    expect(driver.getState().fixType).toBe('2d')

    mockParseNmeaSentence.mockReturnValueOnce({ sentenceId: 'GSA', fixMode: 'none' })
    emitNMEA('$GPGSA,A,1,...')
    expect(driver.getState().fixType).toBe('none')
  })

  // ── Fix loss timeout ──

  it('emits fix-lost after 5s without a valid GGA', async () => {
    vi.useFakeTimers()
    const driver = createDriver()
    await driver.connect()
    const fixLostSpy = vi.fn()
    driver.on('fix-lost', fixLostSpy)

    mockParseNmeaSentence.mockReturnValueOnce({
      sentenceId: 'GGA',
      fixType: '3D',
      latitude: -34.6037,
      longitude: -58.3816,
      altitudeMeters: 25,
      horizontalDilution: 0.9,
      satellitesInView: 8
    })

    emitNMEA('$GPGGA,123519,...')
    expect(driver.isPositionValid()).toBe(true)

    await vi.advanceTimersByTimeAsync(6000)
    expect(fixLostSpy).toHaveBeenCalledTimes(1)
    expect(driver.isPositionValid()).toBe(false)
    expect(driver.getLastPosition()).toBeNull()
    vi.useRealTimers()
  })

  it('renewed GGA prevents fix-loss timeout', async () => {
    vi.useFakeTimers()
    const driver = createDriver()
    await driver.connect()
    const fixLostSpy = vi.fn()
    driver.on('fix-lost', fixLostSpy)

    mockParseNmeaSentence.mockReturnValue({
      sentenceId: 'GGA',
      fixType: '3D',
      latitude: -34.6037,
      longitude: -58.3816,
      altitudeMeters: 25,
      horizontalDilution: 0.9,
      satellitesInView: 8
    })

    emitNMEA('$GPGGA,123519,4807.038,S,01131.000,W,1,08,0.9,545.4,M,46.9,M,,*47')
    await vi.advanceTimersByTimeAsync(3000)
    emitNMEA('$GPGGA,123519,4807.038,S,01131.000,W,1,08,0.9,545.4,M,46.9,M,,*47')
    await vi.advanceTimersByTimeAsync(3000)
    emitNMEA('$GPGGA,123519,4807.038,S,01131.000,W,1,08,0.9,545.4,M,46.9,M,,*47')
    await vi.advanceTimersByTimeAsync(3000)

    expect(fixLostSpy).not.toHaveBeenCalled()
    expect(driver.isPositionValid()).toBe(true)
    vi.useRealTimers()
  })

  // ── NMEA event ──

  it('emits raw NMEA line on nmea event', async () => {
    const driver = createDriver()
    await driver.connect()
    const nmeaSpy = vi.fn()
    driver.on('nmea', nmeaSpy)

    mockParseNmeaSentence.mockReturnValueOnce({
      sentenceId: 'GGA',
      fixType: 'none',
      latitude: 0,
      longitude: 0,
      altitudeMeters: 0,
      horizontalDilution: 0,
      satellitesInView: 0
    })

    emitNMEA('$GPGGA,123519,,,,,0,,,M,,M,,*42')
    expect(nmeaSpy).toHaveBeenCalledWith('$GPGGA,123519,,,,,0,,,M,,M,,*42')
  })

  // ── NMEA malformed ──

  it('ignores lines that do not start with $', async () => {
    const driver = createDriver()
    await driver.connect()
    const nmeaSpy = vi.fn()
    driver.on('nmea', nmeaSpy)

    emitNMEA('garbage data')
    expect(nmeaSpy).not.toHaveBeenCalled()
  })

  it('ignores malformed NMEA sentences that throw during parse', async () => {
    const driver = createDriver()
    await driver.connect()
    mockParseNmeaSentence.mockImplementationOnce(() => {
      throw new Error('bad checksum')
    })
    const nmeaSpy = vi.fn()
    driver.on('nmea', nmeaSpy)

    emitNMEA('$GPGGA,123519,,,,,0,,,M,,M,,*00')
    expect(nmeaSpy).toHaveBeenCalled()
    expect(driver.getState()).toMatchObject({ position: null, valid: false })
  })
})
