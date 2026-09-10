import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { SerialPortScanner } from './SerialPortScanner'
import type { NBM550Driver } from '../devices/nbm550/NBM550Driver'
import type { GPSDriver } from '../devices/gps/GPSDriver'
import { GARMIN_USB_PORT_PREFIX } from '../devices/gps/garmin/GarminUSBProtocol'

const { serialPortListMock } = vi.hoisted(() => {
  const serialPortListMock = vi.fn()
  return { serialPortListMock }
})

vi.mock('serialport', () => ({
  SerialPort: { list: serialPortListMock }
}))

interface FakeNBMDriver {
  quickProbe: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  removeAllListeners: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
}

interface FakeGPSDriver {
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  removeAllListeners: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
}

function fakeNBM(_port: string, shouldSucceed = true): FakeNBMDriver {
  return {
    quickProbe: vi.fn(async () => {
      if (!shouldSucceed) throw new Error('probe failed')
    }),
    disconnect: vi.fn(async () => {}),
    removeAllListeners: vi.fn(),
    on: vi.fn()
  }
}

function fakeGPS(_port: string, shouldRespond = true): FakeGPSDriver {
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
  }
}

beforeEach(() => {
  vi.useRealTimers()
  serialPortListMock.mockReset()
})

const noGarmin = async (): Promise<{ present: boolean; accessible: boolean }> => ({
  present: false,
  accessible: false
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
      createNBM: () => fakeNBM('COM3', true) as unknown as NBM550Driver
    })
    const result = await scanner.probeNBM('COM3')
    expect(result).toBe(true)
  })

  it('probeNBM returns false when quickProbe fails', async () => {
    const scanner = new SerialPortScanner({
      createNBM: () => fakeNBM('COM3', false) as unknown as NBM550Driver
    })
    const result = await scanner.probeNBM('COM3')
    expect(result).toBe(false)
  })

  it('probeGPS returns true when NMEA received', async () => {
    const scanner = new SerialPortScanner({
      createGPS: () => fakeGPS('COM4', true) as unknown as GPSDriver
    })

    const result = await scanner.probeGPS('COM4', 5000)
    expect(result).toBe(true)
  })

  it('probeGPS returns false on timeout', async () => {
    vi.useFakeTimers()
    const scanner = new SerialPortScanner({
      createGPS: () => fakeGPS('COM4', false) as unknown as GPSDriver
    })

    const probePromise = scanner.probeGPS('COM4', 5000)
    await vi.advanceTimersByTimeAsync(6000)
    const result = await probePromise
    expect(result).toBe(false)
    vi.useRealTimers()
  })

  it('scanAndProbeAll uses preferred ports first', async () => {
    serialPortListMock.mockResolvedValue([{ path: 'COM5' }, { path: 'COM6' }])

    const scanner = new SerialPortScanner(undefined, 'usb', noGarmin)
    // Los preferidos se prueban primero; mockeamos probe para evitar timeouts reales
    vi.spyOn(scanner, 'probeGPS').mockImplementation(async (port) => port === 'COM6')
    vi.spyOn(scanner, 'probeNBM').mockImplementation(async (port) => port === 'COM5')

    const result = await scanner.scanAndProbeAll({ nbm550: 'COM5', gps: 'COM6' })

    expect(result.nbmPort).toBe('COM5')
    expect(result.gpsPort).toBe('COM6')
  })

  it('scanAndProbeAll falls back when preferred ports fail', async () => {
    serialPortListMock.mockResolvedValue([{ path: 'COM7' }, { path: 'COM8' }])

    const scanner = new SerialPortScanner(undefined, 'usb', noGarmin)
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

    const scanner = new SerialPortScanner(undefined, 'usb', noGarmin)
    scanner.probeNBM = probeNBM
    scanner.probeGPS = probeGPS

    await scanner.scanAndProbeAll({ nbm550: 'COM1', gps: 'COM2' })

    // Solo debe probar los preferidos, no el resto
    expect(probeNBM).toHaveBeenCalledTimes(1)
    expect(probeNBM).toHaveBeenCalledWith('COM1')
    expect(probeGPS).toHaveBeenCalledTimes(1)
    expect(probeGPS).toHaveBeenCalledWith('COM2')
  })

  it('probeNBM returns false on timeout', async () => {
    vi.useFakeTimers()
    const scanner = new SerialPortScanner({
      createNBM: () =>
        ({
          quickProbe: vi.fn(
            () =>
              new Promise<void>((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 10000)
              )
          ),
          disconnect: vi.fn(async () => {}),
          removeAllListeners: vi.fn(),
          on: vi.fn()
        }) as unknown as NBM550Driver
    })

    const probePromise = scanner.probeNBM('COM5', 5000)
    await vi.advanceTimersByTimeAsync(6000)
    const result = await probePromise
    expect(result).toBe(false)
    vi.useRealTimers()
  })

  it('listAvailablePorts returns empty when no ports found', async () => {
    serialPortListMock.mockResolvedValue([])
    const scanner = new SerialPortScanner()
    const ports = await scanner.listAvailablePorts()
    expect(ports).toEqual([])
  })

  it('probeGPS returns false on connect error', async () => {
    const scanner = new SerialPortScanner({
      createGPS: () =>
        ({
          connect: vi.fn(async () => {
            throw new Error('Connect refused')
          }),
          disconnect: vi.fn(async () => {}),
          removeAllListeners: vi.fn(),
          once: vi.fn(),
          on: vi.fn()
        }) as unknown as GPSDriver
    })

    const result = await scanner.probeGPS('COM6', 5000)
    expect(result).toBe(false)
  })

  it('handles disconnect error gracefully during NBM probe cleanup', async () => {
    const scanner = new SerialPortScanner({
      createNBM: () =>
        ({
          quickProbe: vi.fn(async () => {}),
          disconnect: vi.fn(async () => {
            throw new Error('EPIPE: broken pipe')
          }),
          removeAllListeners: vi.fn(),
          on: vi.fn()
        }) as unknown as NBM550Driver
    })

    // Should not throw despite disconnect error
    const result = await scanner.probeNBM('COM7')
    expect(result).toBe(true)
  })

  it('scanAndProbeAll returns null ports when nothing found', async () => {
    serialPortListMock.mockResolvedValue([{ path: 'COM1' }, { path: 'COM2' }])

    const scanner = new SerialPortScanner(undefined, 'usb', noGarmin)
    vi.spyOn(scanner, 'probeGPS').mockResolvedValue(false)
    vi.spyOn(scanner, 'probeNBM').mockResolvedValue(false)

    const result = await scanner.scanAndProbeAll()

    expect(result.nbmPort).toBeNull()
    expect(result.gpsPort).toBeNull()
  })

  it('scanAndProbeAll uses Garmin USB as GPS when it is accessible', async () => {
    serialPortListMock.mockResolvedValue([{ path: 'COM1' }])
    const probeGPS = vi.fn().mockResolvedValue(true)
    const scanner = new SerialPortScanner(undefined, 'usb', async () => ({
      present: true,
      accessible: true
    }))
    scanner.probeGPS = probeGPS

    const result = await scanner.scanAndProbeAll()

    expect(result.gpsPort).toBe(GARMIN_USB_PORT_PREFIX)
    expect(result.nbmPort).toBeNull()
    expect(probeGPS).not.toHaveBeenCalled()
  })

  it('scanAndProbeAll falls back to serial GPS when Garmin is present but not accessible', async () => {
    serialPortListMock.mockResolvedValue([{ path: 'COM7' }])
    const scanner = new SerialPortScanner(
      { createGPS: () => fakeGPS('COM7', true) as unknown as GPSDriver },
      'usb',
      async () => ({ present: true, accessible: false })
    )

    const result = await scanner.scanAndProbeAll()

    expect(result.gpsPort).toBe('COM7')
  })
})
