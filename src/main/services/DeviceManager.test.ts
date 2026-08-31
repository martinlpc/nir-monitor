import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeviceManager } from './DeviceManager'
import type { ISerialPortScanner } from '../../shared/services/ISerialPortScanner'
import type { PortConfigData } from './ConfigService'
import { AppError } from '../../shared/errors/AppError'

interface DeviceManagerPrivate {
  nbm: unknown
  gps: unknown
  portConfig: PortConfigData
  scanning: boolean
  nbmReconnect: { stop: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> }
  gpsReconnect: { stop: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> }
  nbmPolling: { stop: ReturnType<typeof vi.fn> }
  initNBM: (...args: string[]) => Promise<unknown>
  initGPS: (...args: string[]) => Promise<unknown>
  setPortManual: (device: 'nbm550' | 'gps', port: string) => Promise<void>
}

function pvt(manager: DeviceManager): DeviceManagerPrivate {
  return manager as unknown as DeviceManagerPrivate
}

type OpenCallback = (err?: Error | null) => void
type WriteCallback = (err?: Error | null) => void

const { serialPortListMock, serialPortInstances, FakeSerialPort, mockScanner } = vi.hoisted(() => {
  const serialPortListMock = vi.fn()
  const serialPortInstances: Array<{
    config: Record<string, unknown>
    writes: string[]
    close: ReturnType<typeof vi.fn>
    open: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
    on: (event: string, listener: (...args: unknown[]) => void) => unknown
    emit: (event: string, ...args: unknown[]) => boolean
  }> = []

  class FakeSerialPort {
    static list = serialPortListMock

    readonly config: Record<string, unknown>
    readonly writes: string[] = []
    readonly close = vi.fn((callback?: () => void) => callback?.())
    readonly open = vi.fn((callback: OpenCallback) => callback(null))
    readonly write = vi.fn((data: string, callback?: WriteCallback) => {
      this.writes.push(data)
      callback?.(null)
    })
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>()

    constructor(config: Record<string, unknown>) {
      this.config = config
      serialPortInstances.push(this)
    }

    on(event: string, listener: (...args: unknown[]) => void): this {
      const listeners = this.listeners.get(event) ?? []
      listeners.push(listener)
      this.listeners.set(event, listeners)
      return this
    }

    emit(event: string, ...args: unknown[]): boolean {
      const listeners = this.listeners.get(event) ?? []
      for (const listener of listeners) listener(...args)
      return listeners.length > 0
    }
  }

  const mockScanner: ISerialPortScanner = {
    listAvailablePorts: vi.fn(async () => []),
    scanAndProbeAll: vi.fn(async () => ({
      nbmPort: null,
      gpsPort: null,
      allProbed: []
    })),
    probeNBM: vi.fn(async () => false),
    probeGPS: vi.fn(async () => false)
  }

  return {
    serialPortListMock,
    serialPortInstances,
    FakeSerialPort,
    mockScanner
  }
})

vi.mock('serialport', () => ({
  SerialPort: FakeSerialPort
}))

import { ConfigService } from './ConfigService'

type FakeDevice = EventEmitter & {
  meta: { port: string }
  status: 'connected'
  connect: () => Promise<void>
  disconnect: ReturnType<typeof vi.fn>
  isConnected: () => boolean
}

import type { DriverFactory } from '../../shared/driver-factory'
import type { INBMDriver, IGPSDriver } from '../../shared/driver-interfaces'

class FakeNBMDriver extends EventEmitter {
  meta = { id: 'nbm550', port: '', name: 'Fake NBM', type: 'emf', baudRate: 460800 }
  status: string = 'disconnected'
  disconnect = vi.fn(async () => {})
  readMeasurement = vi.fn()
  readBattery = vi.fn()
  resetMaxHold = vi.fn()
  getProbeInfo = (): null => null
  getMeterSerial = (): null => null

  constructor(port: string) {
    super()
    this.meta = { ...this.meta, port }
  }

  async connect(): Promise<void> {
    this.status = 'connected'
    this.emit('status', 'connected')
  }

  isConnected(): boolean {
    return true
  }
}

class FakeGPSDriver extends EventEmitter {
  meta = { id: 'gps', port: '', name: 'Fake GPS', type: 'gps', baudRate: 4800 }
  status: string = 'disconnected'
  disconnect = vi.fn(async () => {})
  getLastPosition = (): null => null
  isPositionValid = (): boolean => false

  constructor(port: string) {
    super()
    this.meta = { ...this.meta, port }
  }

  async connect(): Promise<void> {
    this.status = 'connected'
    this.emit('status', 'connected')
  }

  isConnected(): boolean {
    return true
  }
}

function createFakeDevice(port: string): FakeDevice {
  const emitter = new EventEmitter() as EventEmitter & {
    meta: { port: string }
    status: 'connected'
    connect: () => Promise<void>
    disconnect: ReturnType<typeof vi.fn>
    isConnected: () => boolean
  }

  emitter.meta = { port }
  emitter.status = 'connected'
  emitter.connect = async () => {}
  emitter.disconnect = vi.fn(async () => {})
  emitter.isConnected = () => true

  return emitter
}

const fakeFactory: DriverFactory = {
  createNBM: (port: string) => new FakeNBMDriver(port) as unknown as INBMDriver,
  createGPS: (port: string) => new FakeGPSDriver(port) as unknown as IGPSDriver
}

describe('DeviceManager', () => {
  beforeEach(() => {
    vi.useRealTimers()
    serialPortListMock.mockReset()
    serialPortInstances.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads saved port config during initialization', async () => {
    const config = new ConfigService()
    const loadPortConfigSpy = vi.spyOn(config, 'loadPortConfig')
    loadPortConfigSpy.mockReturnValue({ nbm550: 'COM9', gps: 'COM8' })

    const manager = new DeviceManager(mockScanner, fakeFactory, config)
    const scanSpy = vi.spyOn(manager, 'scan').mockResolvedValue(manager.getState())

    await manager.initialize()

    expect(loadPortConfigSpy).toHaveBeenCalledTimes(1)
    expect(scanSpy).toHaveBeenCalledTimes(1)
    expect(pvt(manager).portConfig).toEqual({ nbm550: 'COM9', gps: 'COM8' })
  })

  it('prioritizes persisted ports and saves detected devices after scanning', async () => {
    const manager = new DeviceManager(mockScanner, fakeFactory)

    // Mock scanner to return ports
    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: 'COM9',
      gpsPort: 'COM8',
      allProbed: []
    }))

    const state = await manager.scan()

    expect(mockScanner.scanAndProbeAll).toHaveBeenCalled()
    expect(state.scanning).toBe(false)
  })

  it('falls back to the remaining ports when saved ports are missing or invalid', async () => {
    const manager = new DeviceManager(mockScanner, fakeFactory)

    // Mock scanner to return different ports
    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: 'COM2',
      gpsPort: 'COM3',
      allProbed: []
    }))

    const state = await manager.scan()

    expect(mockScanner.scanAndProbeAll).toHaveBeenCalled()
    expect(state.scanning).toBe(false)
  })

  it('allows setting a port manually and persists the new mapping', async () => {
    const config = new ConfigService()
    const savePortConfigSpy = vi.spyOn(config, 'savePortConfig')

    const manager = new DeviceManager(mockScanner, fakeFactory, config)
    const previousNBM = createFakeDevice('COM1')
    pvt(manager).nbm = previousNBM

    const initNBMSpy = vi
      .spyOn(pvt(manager), 'initNBM')
      .mockImplementation(async (...args: unknown[]) => {
        pvt(manager).nbm = createFakeDevice(args[0] as string)
      })

    await manager.setPortManual('nbm550', 'COM7')

    expect(previousNBM.disconnect).toHaveBeenCalledTimes(1)
    expect(initNBMSpy).toHaveBeenCalledWith('COM7')
    expect(savePortConfigSpy).toHaveBeenCalledWith({ nbm550: 'COM7' })
    expect(manager.getState().nbm550.port).toBe('COM7')
  })

  it('disconnects connected devices and clears the manager state', async () => {
    const manager = new DeviceManager(mockScanner, fakeFactory)
    const nbm = createFakeDevice('COM4')
    const gps = createFakeDevice('COM5')

    pvt(manager).nbm = nbm
    pvt(manager).gps = gps

    await manager.disconnectAll()

    expect(nbm.disconnect).toHaveBeenCalledTimes(1)
    expect(gps.disconnect).toHaveBeenCalledTimes(1)
    expect(manager.getState()).toEqual({
      nbm550: { port: null, status: 'disconnected' },
      gps: { port: null, status: 'disconnected' },
      scanning: false
    })
  })

  it('identifies an NBM probe response and sends the expected commands', async () => {
    const manager = new DeviceManager(mockScanner, fakeFactory)

    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: 'COM10',
      gpsPort: null,
      allProbed: []
    }))

    const state = await manager.scan()
    expect(mockScanner.scanAndProbeAll).toHaveBeenCalled()
    expect(state.nbm550.port).toBe('COM10')
  })

  it('rejects an NBM probe when the response does not match the device', async () => {
    const manager = new DeviceManager(mockScanner, fakeFactory)

    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: null,
      gpsPort: null,
      allProbed: []
    }))

    const state = await manager.scan()
    expect(state.nbm550.port).toBeNull()
  })

  it('identifies a GPS probe from incoming NMEA data', async () => {
    const manager = new DeviceManager(mockScanner, fakeFactory)

    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: null,
      gpsPort: 'COM12',
      allProbed: []
    }))

    const state = await manager.scan()
    expect(state.gps.port).toBe('COM12')
  })

  it('times out a GPS probe when no NMEA frame arrives', async () => {
    const manager = new DeviceManager(mockScanner, fakeFactory)

    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: null,
      gpsPort: null,
      allProbed: []
    }))

    const state = await manager.scan()
    expect(state.gps.port).toBeNull()
  })

  it('disconnectDevice stops NBM reconnect and polling and nulls the driver', async () => {
    const manager = new DeviceManager(mockScanner, fakeFactory)
    const nbm = createFakeDevice('COM4')
    pvt(manager).nbm = nbm
    pvt(manager).nbmReconnect = { stop: vi.fn(), reset: vi.fn() }
    pvt(manager).nbmPolling = { stop: vi.fn() }

    await manager.disconnectDevice('nbm550')

    expect(pvt(manager).nbmReconnect.reset).toHaveBeenCalled()
    expect(pvt(manager).nbmPolling.stop).toHaveBeenCalled()
    expect(nbm.disconnect).toHaveBeenCalledTimes(1)
    expect(pvt(manager).nbm).toBeNull()
  })

  it('disconnectDevice stops GPS reconnect and nulls the driver', async () => {
    const manager = new DeviceManager(mockScanner, fakeFactory)
    const gps = createFakeDevice('COM5')
    pvt(manager).gps = gps
    pvt(manager).gpsReconnect = { stop: vi.fn(), reset: vi.fn() }

    await manager.disconnectDevice('gps')

    expect(pvt(manager).gpsReconnect.reset).toHaveBeenCalled()
    expect(gps.disconnect).toHaveBeenCalledTimes(1)
    expect(pvt(manager).gps).toBeNull()
  })

  it('connectDevice returns early when no port is configured', async () => {
    const manager = new DeviceManager(mockScanner, fakeFactory)
    const setPortManualSpy = vi.spyOn(pvt(manager), 'setPortManual').mockResolvedValue(undefined)

    await manager.connectDevice('nbm550')

    expect(setPortManualSpy).not.toHaveBeenCalled()
  })

  it('connectDevice calls setPortManual with the configured port', async () => {
    const manager = new DeviceManager(mockScanner, fakeFactory)
    const nbm = createFakeDevice('COM7')
    pvt(manager).nbm = nbm
    const setPortManualSpy = vi.spyOn(pvt(manager), 'setPortManual').mockResolvedValue(undefined)

    await manager.connectDevice('nbm550')

    expect(setPortManualSpy).toHaveBeenCalledWith('nbm550', 'COM7')
  })

  it('connectDevice falls back to portConfig when driver is null', async () => {
    const manager = new DeviceManager(mockScanner, fakeFactory)
    pvt(manager).portConfig = { nbm550: 'COM8' }
    const setPortManualSpy = vi.spyOn(pvt(manager), 'setPortManual').mockResolvedValue(undefined)

    await manager.connectDevice('nbm550')

    expect(setPortManualSpy).toHaveBeenCalledWith('nbm550', 'COM8')
  })

  // ── Polling activo y muestras ────────────────────────────

  it('emits nbm samples and battery while polling in active mode', async () => {
    vi.useFakeTimers()
    const localFactory: DriverFactory = {
      createNBM: (port) => {
        const driver = new FakeNBMDriver(port)
        driver.readBattery = vi.fn(async () => 90)
        driver.readMeasurement = vi.fn(async () => ({ rss: 2.5, unit: 'V/m', battery: 88 }))
        return driver as unknown as INBMDriver
      },
      createGPS: (port) => new FakeGPSDriver(port) as unknown as IGPSDriver
    }
    const manager = new DeviceManager(mockScanner, localFactory)

    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: 'COM10',
      gpsPort: null,
      allProbed: []
    }))

    const samples: unknown[] = []
    manager.on('nbm:sample', (s) => samples.push(s))
    const batteries: unknown[] = []
    manager.on('nbm:battery', (b) => batteries.push(b))

    await manager.scan()
    await vi.advanceTimersByTimeAsync(0)

    expect(batteries.length).toBeGreaterThan(0)

    manager.setSessionActive(true)
    await vi.advanceTimersByTimeAsync(250)

    expect(samples.length).toBeGreaterThan(0)
  })

  it('starts NBM reconnect after consecutive read failures', async () => {
    vi.useFakeTimers()
    const manager = new DeviceManager(mockScanner, fakeFactory)

    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: 'COM10',
      gpsPort: null,
      allProbed: []
    }))

    await manager.scan()
    const nbm = manager.getNBM() as unknown as FakeNBMDriver
    nbm.readMeasurement = vi.fn(async () => null)

    const errors: unknown[] = []
    manager.on('device:error', (e) => errors.push(e))

    manager.setSessionActive(true)
    await vi.advanceTimersByTimeAsync(2000)

    expect(errors.length).toBeGreaterThan(0)
    expect((errors[0] as { error: { code: string } }).error.code).toBe('NBM_POLL_FAILURE')
    expect(
      (pvt(manager).nbmReconnect as unknown as { isReconnecting: boolean }).isReconnecting
    ).toBe(true)
  })

  // ── Reconexión automática ────────────────────────────────

  it('reconnects the NBM after an unexpected disconnect', async () => {
    vi.useFakeTimers()
    const manager = new DeviceManager(mockScanner, fakeFactory)

    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: 'COM10',
      gpsPort: null,
      allProbed: []
    }))

    await manager.scan()
    const nbm = manager.getNBM() as unknown as FakeNBMDriver

    nbm.emit('status', 'disconnected')
    expect(
      (pvt(manager).nbmReconnect as unknown as { isReconnecting: boolean }).isReconnecting
    ).toBe(true)

    await vi.advanceTimersByTimeAsync(3000)
    await vi.advanceTimersByTimeAsync(1000)

    expect(
      (pvt(manager).nbmReconnect as unknown as { isReconnecting: boolean }).isReconnecting
    ).toBe(false)
    expect(manager.getNBM()).not.toBeNull()
  })

  it('reconnects the GPS after an unexpected disconnect', async () => {
    vi.useFakeTimers()
    const manager = new DeviceManager(mockScanner, fakeFactory)

    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: null,
      gpsPort: 'COM12',
      allProbed: []
    }))

    await manager.scan()
    const gps = manager.getGPS() as FakeGPSDriver

    gps.emit('status', 'disconnected')
    expect(
      (pvt(manager).gpsReconnect as unknown as { isReconnecting: boolean }).isReconnecting
    ).toBe(true)

    await vi.advanceTimersByTimeAsync(3000)
    await vi.advanceTimersByTimeAsync(1000)

    expect(
      (pvt(manager).gpsReconnect as unknown as { isReconnecting: boolean }).isReconnecting
    ).toBe(false)
    expect(manager.getGPS()).not.toBeNull()
  })

  // ── Manejo de errores de drivers ─────────────────────────

  it('emits device:error for NBM AppError and generic errors', async () => {
    const manager = new DeviceManager(mockScanner, fakeFactory)

    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: 'COM10',
      gpsPort: null,
      allProbed: []
    }))

    await manager.scan()

    const errors: unknown[] = []
    manager.on('device:error', (e) => errors.push(e))

    const nbm = manager.getNBM() as unknown as FakeNBMDriver
    nbm.emit(
      'error',
      new AppError({
        code: 'NBM_101',
        message: 'error 101',
        severity: 'error',
        category: 'nbm',
        userAction: 'x'
      })
    )
    expect((errors[0] as { error: { code: string } }).error.code).toBe('NBM_101')

    nbm.emit('error', new Error('generic failure'))
    expect((errors[1] as { error: { code: string } }).error.code).toBe('NBM_ERROR')
  })

  it('emits device:error for GPS AppError and generic errors', async () => {
    const manager = new DeviceManager(mockScanner, fakeFactory)

    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: null,
      gpsPort: 'COM12',
      allProbed: []
    }))

    await manager.scan()

    const errors: unknown[] = []
    manager.on('device:error', (e) => errors.push(e))

    const gps = manager.getGPS() as FakeGPSDriver
    gps.emit(
      'error',
      new AppError({
        code: 'GPS_1',
        message: 'gps error',
        severity: 'error',
        category: 'gps',
        userAction: 'x'
      })
    )
    expect((errors[0] as { error: { code: string } }).error.code).toBe('GPS_1')

    gps.emit('error', new Error('generic gps failure'))
    expect((errors[1] as { error: { code: string } }).error.code).toBe('GPS_ERROR')
  })

  // ── Fallos de conexión en init ───────────────────────────

  it('logs and keeps the driver when NBM connect fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failingFactory: DriverFactory = {
      createNBM: (port) => {
        const driver = new FakeNBMDriver(port)
        driver.connect = async () => {
          throw new Error('port busy')
        }
        return driver as unknown as INBMDriver
      },
      createGPS: (port) => new FakeGPSDriver(port) as unknown as IGPSDriver
    }
    const manager = new DeviceManager(mockScanner, failingFactory)

    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: 'COM10',
      gpsPort: null,
      allProbed: []
    }))

    await manager.scan()
    expect(manager.getNBM()).not.toBeNull()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('retries the GPS connect and eventually succeeds', async () => {
    const failingFactory: DriverFactory = {
      createNBM: (port) => new FakeNBMDriver(port) as unknown as INBMDriver,
      createGPS: (port) => {
        const driver = new FakeGPSDriver(port)
        const original = driver.connect.bind(driver)
        let attempts = 0
        driver.connect = async () => {
          attempts++
          if (attempts < 3) throw new Error('not ready')
          return original()
        }
        return driver as unknown as IGPSDriver
      }
    }
    const manager = new DeviceManager(mockScanner, failingFactory)

    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: null,
      gpsPort: 'COM12',
      allProbed: []
    }))

    await manager.scan()
    expect(manager.getGPS()).not.toBeNull()
  })

  it('returns the GPS driver when all connect attempts fail', async () => {
    const failingFactory: DriverFactory = {
      createNBM: (port) => new FakeNBMDriver(port) as unknown as INBMDriver,
      createGPS: (port) => {
        const driver = new FakeGPSDriver(port)
        driver.connect = async () => {
          throw new Error('not ready')
        }
        return driver as unknown as IGPSDriver
      }
    }
    const manager = new DeviceManager(mockScanner, failingFactory)

    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: null,
      gpsPort: 'COM12',
      allProbed: []
    }))

    await manager.scan()
    expect(manager.getGPS()).not.toBeNull()
    expect(manager.getGPS()?.status).toBe('disconnected')
  })

  // ── Config manual GPS y guardas ──────────────────────────

  it('sets the GPS port manually and persists the mapping', async () => {
    const config = new ConfigService()
    const savePortConfigSpy = vi.spyOn(config, 'savePortConfig')

    const manager = new DeviceManager(mockScanner, fakeFactory, config)
    const previousGPS = createFakeDevice('COM2')
    pvt(manager).gps = previousGPS

    const initGPSSpy = vi
      .spyOn(pvt(manager), 'initGPS')
      .mockImplementation(async (...args: unknown[]) => {
        pvt(manager).gps = createFakeDevice(args[0] as string)
      })

    await manager.setPortManual('gps', 'COM6')

    expect(previousGPS.disconnect).toHaveBeenCalledTimes(1)
    expect(initGPSSpy).toHaveBeenCalledWith('COM6')
    expect(savePortConfigSpy).toHaveBeenCalledWith({ gps: 'COM6' })
    expect(manager.getState().gps.port).toBe('COM6')
  })

  it('returns the current state when a scan is already in progress', async () => {
    const manager = new DeviceManager(mockScanner, fakeFactory)
    vi.mocked(mockScanner.scanAndProbeAll).mockClear()
    pvt(manager).scanning = true

    const state = await manager.scan()

    expect(state.scanning).toBe(true)
    expect(mockScanner.scanAndProbeAll).not.toHaveBeenCalled()
  })
})
