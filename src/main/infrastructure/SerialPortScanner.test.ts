import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { SerialPortScanner, type DriverFactories } from './SerialPortScanner'

const { serialPortListMock } = vi.hoisted(() => {
  const serialPortListMock = vi.fn()
  return { serialPortListMock }
})

vi.mock('serialport', () => ({
  SerialPort: { list: serialPortListMock }
}))

function fakeNBM(port: string, shouldSucceed = true) {
  return {
    quickProbe: vi.fn(async () => {
      if (!shouldSucceed) throw new Error('probe failed')
    }),
    disconnect: vi.fn(async () => {}),
    removeAllListeners: vi.fn(),
    on: vi.fn()
  } as unknown as any
}

function fakeGPS(port: string, shouldRespond = true) {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {}

  return {
    connect: vi.fn(async () => {
      if (shouldRespond) {
        setTimeout(() => {
          listeners.nmea?.forEach((fn) =>
            fn('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47')
          )
        }, 10)
      }
    }),
    disconnect: vi.fn(async () => {}),
    removeAllListeners: vi.fn((event?: string) => {
      if (event) delete listeners[event]
      else Object.keys(listeners).forEach((k) => delete listeners[k])
    }),
    once: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(fn)
    }),
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(fn)
    })
  } as unknown as any
}

beforeEach(() => {
  vi.useRealTimers()
  serialPortListMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SerialPortScanner', () => {
  it('lists available ports', async () => {
    serialPortListMock.mockResolvedValue([{ path: 'COM1' }, { path: 'COM2' }])
    const scanner = new SerialPortScanner()
    const ports = await scanner.listAvailablePorts()
    expect(ports).toEqual(['COM1', 'COM2'])
  })

  it('probeNBM returns true when quickProbe succeeds', async () => {
    const scanner = new SerialPortScanner({
      createNBM: () => fakeNBM('COM3', true)
    })
    const result = await scanner.probeNBM('COM3')
    expect(result).toBe(true)
  })

  it('probeNBM returns false when quickProbe fails', async () => {
    const scanner = new SerialPortScanner({
      createNBM: () => fakeNBM('COM3', false)
    })
    const result = await scanner.probeNBM('COM3')
    expect(result).toBe(false)
  })

  it('probeGPS returns true when NMEA received', async () => {
    const scanner = new SerialPortScanner({
      createGPS: () => fakeGPS('COM4', true)
    })

    const result = await scanner.probeGPS('COM4', 5000)
    expect(result).toBe(true)
  })

  it('probeGPS returns false on timeout', async () => {
    vi.useFakeTimers()
    const scanner = new SerialPortScanner({
      createGPS: () => fakeGPS('COM4', false)
    })

    const probePromise = scanner.probeGPS('COM4', 5000)
    await vi.advanceTimersByTimeAsync(6000)
    const result = await probePromise
    expect(result).toBe(false)
    vi.useRealTimers()
  })

  it('scanAndProbeAll uses preferred ports first', async () => {
    serialPortListMock.mockResolvedValue([{ path: 'COM5' }, { path: 'COM6' }])

    const scanner = new SerialPortScanner()
    // Los preferidos se prueban primero; mockeamos probe para evitar timeouts reales
    vi.spyOn(scanner, 'probeGPS').mockImplementation(async (port) => port === 'COM6')
    vi.spyOn(scanner, 'probeNBM').mockImplementation(async (port) => port === 'COM5')

    const result = await scanner.scanAndProbeAll({ nbm550: 'COM5', gps: 'COM6' })

    expect(result.nbmPort).toBe('COM5')
    expect(result.gpsPort).toBe('COM6')
  })

  it('scanAndProbeAll falls back when preferred ports fail', async () => {
    serialPortListMock.mockResolvedValue([{ path: 'COM7' }, { path: 'COM8' }])

    const scanner = new SerialPortScanner()
    vi.spyOn(scanner, 'probeGPS').mockImplementation(async (port) => port === 'COM7')
    vi.spyOn(scanner, 'probeNBM').mockImplementation(async (port) => port === 'COM8')

    const result = await scanner.scanAndProbeAll({ nbm550: 'COM99', gps: 'COM99' })

    expect(result.nbmPort).toBe('COM8')
    expect(result.gpsPort).toBe('COM7')
  })

  it('scanAndProbeAll skips full scan if both preferred ports work', async () => {
    serialPortListMock.mockResolvedValue([{ path: 'COM1' }, { path: 'COM2' }, { path: 'COM3' }])

    const probeNBM = vi.fn().mockResolvedValue(true)
    const probeGPS = vi.fn().mockResolvedValue(true)

    const scanner = new SerialPortScanner()
    scanner.probeNBM = probeNBM
    scanner.probeGPS = probeGPS

    await scanner.scanAndProbeAll({ nbm550: 'COM1', gps: 'COM2' })

    // Solo debe probar los preferidos, no el resto
    expect(probeNBM).toHaveBeenCalledTimes(1)
    expect(probeNBM).toHaveBeenCalledWith('COM1')
    expect(probeGPS).toHaveBeenCalledTimes(1)
    expect(probeGPS).toHaveBeenCalledWith('COM2')
  })

  it('scanAndProbeAll returns null ports when nothing found', async () => {
    serialPortListMock.mockResolvedValue([{ path: 'COM1' }, { path: 'COM2' }])

    const scanner = new SerialPortScanner()
    vi.spyOn(scanner, 'probeGPS').mockResolvedValue(false)
    vi.spyOn(scanner, 'probeNBM').mockResolvedValue(false)

    const result = await scanner.scanAndProbeAll()

    expect(result.nbmPort).toBeNull()
    expect(result.gpsPort).toBeNull()
  })
})
