import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeviceManager } from './DeviceManager'

type OpenCallback = (err?: Error | null) => void
type WriteCallback = (err?: Error | null) => void

const {
  serialPortListMock,
  serialPortInstances,
  FakeSerialPort,
  loadPortConfigMock,
  savePortConfigMock
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

  return {
    serialPortListMock,
    serialPortInstances,
    FakeSerialPort,
    loadPortConfigMock: vi.fn(),
    savePortConfigMock: vi.fn()
  }
})

vi.mock('serialport', () => ({
  SerialPort: FakeSerialPort
}))

vi.mock('./PortConfig', () => ({
  loadPortConfig: loadPortConfigMock,
  savePortConfig: savePortConfigMock
}))

function createFakeDevice(port: string) {
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
    const manager = new DeviceManager()
    const scanSpy = vi.spyOn(manager, 'scan').mockResolvedValue(manager.getState())

    loadPortConfigMock.mockReturnValue({ nbm550: 'COM9', gps: 'COM8' })

    await manager.initialize()

    expect(loadPortConfigMock).toHaveBeenCalledTimes(1)
    expect(scanSpy).toHaveBeenCalledTimes(1)
    expect((manager as any).portConfig).toEqual({ nbm550: 'COM9', gps: 'COM8' })
  })

  it('prioritizes persisted ports and saves detected devices after scanning', async () => {
    const manager = new DeviceManager()
    const initNBMSpy = vi
      .spyOn(manager as any, 'initNBM')
      .mockImplementation(async (...args: unknown[]) => {
        ;(manager as any).nbm = createFakeDevice(args[0] as string)
      })
    const initGPSSpy = vi
      .spyOn(manager as any, 'initGPS')
      .mockImplementation(async (...args: unknown[]) => {
        ;(manager as any).gps = createFakeDevice(args[0] as string)
      })
    const probeNBMSpy = vi.spyOn(manager as any, 'probeNBM').mockResolvedValue(true)
    const probeGPSSpy = vi.spyOn(manager as any, 'probeGPS').mockResolvedValue(true)

    ;(manager as any).portConfig = { nbm550: 'COM9', gps: 'COM8' }
    serialPortListMock.mockResolvedValue([{ path: 'COM9' }, { path: 'COM8' }, { path: 'COM7' }])

    const state = await manager.scan()

    expect(probeNBMSpy).toHaveBeenCalledTimes(1)
    expect(probeNBMSpy).toHaveBeenCalledWith('COM9')
    expect(probeGPSSpy).toHaveBeenCalledTimes(1)
    expect(probeGPSSpy).toHaveBeenCalledWith('COM8')
    expect(initNBMSpy).toHaveBeenCalledWith('COM9')
    expect(initGPSSpy).toHaveBeenCalledWith('COM8')
    expect(savePortConfigMock).toHaveBeenCalledWith({ nbm550: 'COM9', gps: 'COM8' })
    expect(state).toEqual({
      nbm550: { port: 'COM9', status: 'connected' },
      gps: { port: 'COM8', status: 'connected' },
      scanning: false
    })
  })

  it('falls back to the remaining ports when saved ports are missing or invalid', async () => {
    const manager = new DeviceManager()

    vi.spyOn(manager as any, 'initNBM').mockImplementation(async (...args: unknown[]) => {
      ;(manager as any).nbm = createFakeDevice(args[0] as string)
    })
    vi.spyOn(manager as any, 'initGPS').mockImplementation(async (...args: unknown[]) => {
      ;(manager as any).gps = createFakeDevice(args[0] as string)
    })
    vi.spyOn(manager as any, 'probeNBM').mockImplementation(
      async (...args: unknown[]) => (args[0] as string) === 'COM2'
    )
    vi.spyOn(manager as any, 'probeGPS').mockImplementation(
      async (...args: unknown[]) => (args[0] as string) === 'COM3'
    )
    ;(manager as any).portConfig = { nbm550: 'COM9', gps: 'COM8' }
    serialPortListMock.mockResolvedValue([{ path: 'COM1' }, { path: 'COM2' }, { path: 'COM3' }])

    const state = await manager.scan()

    expect(savePortConfigMock).toHaveBeenCalledWith({ nbm550: 'COM2', gps: 'COM3' })
    expect(state.nbm550.port).toBe('COM2')
    expect(state.gps.port).toBe('COM3')
  })

  it('allows setting a port manually and persists the new mapping', async () => {
    const manager = new DeviceManager()
    const previousNBM = createFakeDevice('COM1')
    ;(manager as any).nbm = previousNBM

    const initNBMSpy = vi
      .spyOn(manager as any, 'initNBM')
      .mockImplementation(async (...args: unknown[]) => {
        ;(manager as any).nbm = createFakeDevice(args[0] as string)
      })

    await manager.setPortManual('nbm550', 'COM7')

    expect(previousNBM.disconnect).toHaveBeenCalledTimes(1)
    expect(initNBMSpy).toHaveBeenCalledWith('COM7')
    expect(savePortConfigMock).toHaveBeenCalledWith({ nbm550: 'COM7' })
    expect(manager.getState().nbm550.port).toBe('COM7')
  })

  it('disconnects connected devices and clears the manager state', async () => {
    const manager = new DeviceManager()
    const nbm = createFakeDevice('COM4')
    const gps = createFakeDevice('COM5')

    ;(manager as any).nbm = nbm
    ;(manager as any).gps = gps

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
    vi.useFakeTimers()

    const manager = new DeviceManager()
    const probePromise = (manager as any).probeNBM('COM10')

    expect(serialPortInstances).toHaveLength(1)
    const port = serialPortInstances[0]

    await vi.advanceTimersByTimeAsync(200)
    expect(port.write).toHaveBeenCalledWith('REMOTE ON;\r\n', expect.any(Function))

    await vi.advanceTimersByTimeAsync(300)
    expect(port.write).toHaveBeenCalledWith('DEVICE_INFO?;\r\n', expect.any(Function))

    port.emit('data', Buffer.from('NBM-550;\r', 'ascii'))

    await expect(probePromise).resolves.toBe(true)
    expect(port.close).toHaveBeenCalledTimes(1)
    expect(port.config).toMatchObject({ path: 'COM10', baudRate: 460800, autoOpen: false })
  })

  it('rejects an NBM probe when the response does not match the device', async () => {
    const manager = new DeviceManager()
    const probePromise = (manager as any).probeNBM('COM11')
    const port = serialPortInstances[0]

    port.emit('data', Buffer.from('OTHER_DEVICE;\r', 'ascii'))

    await expect(probePromise).resolves.toBe(false)
    expect(port.close).toHaveBeenCalledTimes(1)
  })

  it('identifies a GPS probe from incoming NMEA data', async () => {
    const manager = new DeviceManager()
    const probePromise = (manager as any).probeGPS('COM12')
    const port = serialPortInstances[0]

    port.emit('data', Buffer.from('$GPRMC,123519,A,4807.038,N,01131.000,E\r\n', 'ascii'))

    await expect(probePromise).resolves.toBe(true)
    expect(port.close).toHaveBeenCalledTimes(1)
    expect(port.config).toMatchObject({ path: 'COM12', baudRate: 4800, autoOpen: false })
  })

  it('times out a GPS probe when no NMEA frame arrives', async () => {
    vi.useFakeTimers()

    const manager = new DeviceManager()
    const probePromise = (manager as any).probeGPS('COM13')
    const port = serialPortInstances[0]

    await vi.advanceTimersByTimeAsync(2500)

    await expect(probePromise).resolves.toBe(false)
    expect(port.close).toHaveBeenCalledTimes(1)
  })
})
