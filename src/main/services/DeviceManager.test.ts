import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeviceManager } from './DeviceManager'
import type { ISerialPortScanner } from '../../shared/services/ISerialPortScanner'
import type { PortConfigData } from './PortConfig'

interface DeviceManagerPrivate {
  nbm: unknown
  gps: unknown
  portConfig: PortConfigData
  nbmReconnect: { stop: ReturnType<typeof vi.fn> }
  gpsReconnect: { stop: ReturnType<typeof vi.fn> }
  nbmPolling: { stop: ReturnType<typeof vi.fn> }
  initNBM: (...args: string[]) => Promise<unknown>
  setPortManual: (device: 'nbm550' | 'gps', port: string) => Promise<void>
}

function pvt(manager: DeviceManager): DeviceManagerPrivate {
  return manager as unknown as DeviceManagerPrivate
}

type OpenCallback = (err?: Error | null) => void
type WriteCallback = (err?: Error | null) => void

const {
  serialPortListMock,
  serialPortInstances,
  FakeSerialPort,
  loadPortConfigMock,
  savePortConfigMock,
  mockScanner
} = vi.hoisted(() => {
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
    loadPortConfigMock: vi.fn(),
    savePortConfigMock: vi.fn(),
    mockScanner
  }
})

vi.mock('serialport', () => ({
  SerialPort: FakeSerialPort
}))

vi.mock('./PortConfig', () => ({
  loadPortConfig: loadPortConfigMock,
  savePortConfig: savePortConfigMock
}))

type FakeDevice = EventEmitter & {
  meta: { port: string }
  status: 'connected'
  connect: () => Promise<void>
  disconnect: ReturnType<typeof vi.fn>
  isConnected: () => boolean
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

describe('DeviceManager', () => {
  beforeEach(() => {
    vi.useRealTimers()
    serialPortListMock.mockReset()
    serialPortInstances.length = 0
    loadPortConfigMock.mockReset()
    savePortConfigMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads saved port config during initialization', async () => {
    const manager = new DeviceManager(mockScanner)
    const scanSpy = vi.spyOn(manager, 'scan').mockResolvedValue(manager.getState())

    loadPortConfigMock.mockReturnValue({ nbm550: 'COM9', gps: 'COM8' })

    await manager.initialize()

    expect(loadPortConfigMock).toHaveBeenCalledTimes(1)
    expect(scanSpy).toHaveBeenCalledTimes(1)
    expect(pvt(manager).portConfig).toEqual({ nbm550: 'COM9', gps: 'COM8' })
  })

  it('prioritizes persisted ports and saves detected devices after scanning', async () => {
    const manager = new DeviceManager(mockScanner)

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
    const manager = new DeviceManager(mockScanner)

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
    const manager = new DeviceManager(mockScanner)
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
    expect(savePortConfigMock).toHaveBeenCalledWith({ nbm550: 'COM7' })
    expect(manager.getState().nbm550.port).toBe('COM7')
  })

  it('disconnects connected devices and clears the manager state', async () => {
    const manager = new DeviceManager(mockScanner)
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
    const manager = new DeviceManager(mockScanner)

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
    const manager = new DeviceManager(mockScanner)

    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: null,
      gpsPort: null,
      allProbed: []
    }))

    const state = await manager.scan()
    expect(state.nbm550.port).toBeNull()
  })

  it('identifies a GPS probe from incoming NMEA data', async () => {
    const manager = new DeviceManager(mockScanner)

    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: null,
      gpsPort: 'COM12',
      allProbed: []
    }))

    const state = await manager.scan()
    expect(state.gps.port).toBe('COM12')
  })

  it('times out a GPS probe when no NMEA frame arrives', async () => {
    const manager = new DeviceManager(mockScanner)

    mockScanner.scanAndProbeAll = vi.fn(async () => ({
      nbmPort: null,
      gpsPort: null,
      allProbed: []
    }))

    const state = await manager.scan()
    expect(state.gps.port).toBeNull()
  })

  it('disconnectDevice stops NBM reconnect and polling and nulls the driver', async () => {
    const manager = new DeviceManager(mockScanner)
    const nbm = createFakeDevice('COM4')
    pvt(manager).nbm = nbm
    pvt(manager).nbmReconnect = { stop: vi.fn() }
    pvt(manager).nbmPolling = { stop: vi.fn() }

    await manager.disconnectDevice('nbm550')

    expect(pvt(manager).nbmReconnect.stop).toHaveBeenCalled()
    expect(pvt(manager).nbmPolling.stop).toHaveBeenCalled()
    expect(nbm.disconnect).toHaveBeenCalledTimes(1)
    expect(pvt(manager).nbm).toBeNull()
  })

  it('disconnectDevice stops GPS reconnect and nulls the driver', async () => {
    const manager = new DeviceManager(mockScanner)
    const gps = createFakeDevice('COM5')
    pvt(manager).gps = gps
    pvt(manager).gpsReconnect = { stop: vi.fn() }

    await manager.disconnectDevice('gps')

    expect(pvt(manager).gpsReconnect.stop).toHaveBeenCalled()
    expect(gps.disconnect).toHaveBeenCalledTimes(1)
    expect(pvt(manager).gps).toBeNull()
  })

  it('connectDevice returns early when no port is configured', async () => {
    const manager = new DeviceManager(mockScanner)
    const setPortManualSpy = vi.spyOn(pvt(manager), 'setPortManual').mockResolvedValue(undefined)

    await manager.connectDevice('nbm550')

    expect(setPortManualSpy).not.toHaveBeenCalled()
  })

  it('connectDevice calls setPortManual with the configured port', async () => {
    const manager = new DeviceManager(mockScanner)
    const nbm = createFakeDevice('COM7')
    pvt(manager).nbm = nbm
    const setPortManualSpy = vi.spyOn(pvt(manager), 'setPortManual').mockResolvedValue(undefined)

    await manager.connectDevice('nbm550')

    expect(setPortManualSpy).toHaveBeenCalledWith('nbm550', 'COM7')
  })

  it('connectDevice falls back to portConfig when driver is null', async () => {
    const manager = new DeviceManager(mockScanner)
    pvt(manager).portConfig = { nbm550: 'COM8' }
    const setPortManualSpy = vi.spyOn(pvt(manager), 'setPortManual').mockResolvedValue(undefined)

    await manager.connectDevice('nbm550')

    expect(setPortManualSpy).toHaveBeenCalledWith('nbm550', 'COM8')
  })
})
