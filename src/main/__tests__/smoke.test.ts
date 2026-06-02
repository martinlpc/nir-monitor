import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { DeviceManager } from '../services/DeviceManager'
import { SessionService } from '../services/SessionService'
import { GeoFusionService } from '../services/GeoFusionService'
import type { ISerialPortScanner } from '../../shared/services/ISerialPortScanner'

const { portInstances, FakeSerialPort, gpsParserDataListeners, mockParseNmeaSentence } = vi.hoisted(() => {
  const gpsParserDataListeners: Array<(line: string) => void> = []
  const mockParseNmeaSentence = vi.fn()

  class FakeSerialPort {
    static instances: FakeSerialPort[] = []
    static openShouldFail: Error | null = null

    writes: string[] = []
    isOpen = false
    private dataListeners: Array<(chunk: Buffer) => void> = []
    private errorListeners: Array<(err: Error) => void> = []
    private closeListeners: Array<() => void> = []

    constructor() {
      FakeSerialPort.instances.push(this)
    }

    on(event: string, fn: (...args: unknown[]) => void): this {
      if (event === 'data') this.dataListeners.push(fn as (chunk: Buffer) => void)
      else if (event === 'error') this.errorListeners.push(fn as (err: Error) => void)
      else if (event === 'close') this.closeListeners.push(fn as () => void)
      return this
    }

    write(data: string, cb?: (err?: Error | null) => void): void {
      this.writes.push(data)
      cb?.(null)
    }

    open(cb: (err?: Error | null) => void): void {
      if (FakeSerialPort.openShouldFail) {
        const err = FakeSerialPort.openShouldFail
        FakeSerialPort.openShouldFail = null
        cb(err)
        return
      }
      this.isOpen = true
      cb(null)
    }

    close(cb?: () => void): void {
      this.isOpen = false
      this.closeListeners.forEach((fn) => fn())
      cb?.()
    }

    flush(cb?: () => void): void {
      cb?.()
    }

    pipe(): { on: (event: string, fn: (...args: unknown[]) => void) => void } {
      return {
        on(event: string, fn: (...args: unknown[]) => void) {
          if (event === 'data') gpsParserDataListeners.push(fn as (line: string) => void)
        }
      }
    }

    emitData(data: string): void {
      this.dataListeners.forEach((fn) => fn(Buffer.from(data, 'ascii')))
    }

    emitError(err: Error): void {
      this.errorListeners.forEach((fn) => fn(err))
    }

    emitClose(): void {
      this.isOpen = false
      this.closeListeners.forEach((fn) => fn())
    }
  }

  const portInstances: FakeSerialPort[] = FakeSerialPort.instances
  return { portInstances, FakeSerialPort, gpsParserDataListeners, mockParseNmeaSentence }
})

vi.mock('serialport', () => ({
  SerialPort: FakeSerialPort
}))

vi.mock('@serialport/parser-readline', () => ({
  ReadlineParser: vi.fn()
}))

vi.mock('../services/PortConfig', () => ({
  loadPortConfig: vi.fn(() => ({})),
  savePortConfig: vi.fn()
}))

vi.mock('nmea-simple', () => ({
  parseNmeaSentence: (...args: unknown[]) => mockParseNmeaSentence(...args)
}))

vi.mock('../ipc/SettingsHandler', () => ({
  getLoadedUncertainty: () => ({
    filePath: '/fake/uncertainty.csv',
    headers: ['name', 'fMin', 'fMax', 'uncertainty', 'factor'],
    records: [{ name: 'EF-0391', fMin: 0, fMax: 0, uncertainty: 0, factor: 1.37 }]
  })
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/fake/userData') }
}))

describe('Smoke: full chain', () => {
  let deviceManager: DeviceManager
  let sessionService: SessionService
  let mockScanner: ISerialPortScanner

  beforeEach(() => {
    vi.useFakeTimers()
    FakeSerialPort.instances.length = 0
    FakeSerialPort.openShouldFail = null
    gpsParserDataListeners.length = 0
    mockParseNmeaSentence.mockReset()

    mockScanner = {
      listAvailablePorts: vi.fn(async () => []),
      scanAndProbeAll: vi.fn(async () => ({
        nbmPort: 'COM3',
        gpsPort: 'COM4',
        allProbed: []
      })),
      probeNBM: vi.fn(async () => false),
      probeGPS: vi.fn(async () => false)
    }

    deviceManager = new DeviceManager(mockScanner)
    sessionService = new SessionService(new GeoFusionService())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function respondToNBMInit(): Promise<void> {
    await vi.waitFor(
      () => expect(FakeSerialPort.instances.length).toBeGreaterThan(0),
      { timeout: 10000, interval: 50 }
    )
    const port = FakeSerialPort.instances[0]

    const waitForWrite = (contains: string) =>
      vi.waitFor(
        () => expect(port.writes.some((w) => w.includes(contains))).toBe(true),
        { timeout: 15000, interval: 100 }
      )

    await waitForWrite('REMOTE ON')
    port.emitData('0;\r')

    await waitForWrite('SAMPLE_RATE')
    port.emitData('0;\r')

    await waitForWrite('MEAS_VIEW')
    port.emitData('0;\r')

    await waitForWrite('RESULT_TYPE')
    port.emitData('0;\r')

    await waitForWrite('RESULT_UNIT ')
    port.emitData('0;\r')

    await waitForWrite('RESULT_UNIT?')
    port.emitData('V/m;\r')

    await waitForWrite('PROBE_INFO?')
    port.emitData('"EF-0391",0,"12345","2024-03-15";\r')
  }

  it('scan -> connect -> session start/stop -> disconnect', async () => {
    vi.useRealTimers()

    const scanPromise = deviceManager.scan()
    await respondToNBMInit()
    await scanPromise

    expect(deviceManager.getState().nbm550.status).toBe('connected')
    expect(deviceManager.getState().gps.status).toBe('connected')
    expect(deviceManager.getNBM()).not.toBeNull()
    expect(deviceManager.getGPS()).not.toBeNull()

    const nbm = deviceManager.getNBM()!
    const gps = deviceManager.getGPS()!
    ;(deviceManager as any).nbmPolling.stop()

    if (FakeSerialPort.instances[0].writes.some((w) => w.includes('BATTERY?'))) {
      FakeSerialPort.instances[0].emitData('100;\r')
    }
    if (FakeSerialPort.instances[0].writes.some((w) => w.includes('MEAS?'))) {
      FakeSerialPort.instances[0].emitData('12.5,0,0,0,95;\r')
    }

    sessionService.setNBM(nbm)
    expect((sessionService as any).correctionFactor).toBe(1.37)
    sessionService.setGPS(gps)

    mockParseNmeaSentence.mockReturnValue({
      sentenceId: 'GGA',
      fixType: '3D',
      latitude: -34.6037,
      longitude: -58.3816,
      altitudeMeters: 25,
      horizontalDilution: 0.9,
      satellitesInView: 8
    })
    gpsParserDataListeners.forEach((fn) =>
      fn('$GPGGA,123519,4807.038,S,01131.000,W,1,08,0.9,545.4,M,46.9,M,,*47')
    )

    expect(gps.isPositionValid()).toBe(true)

    const nbmPort = FakeSerialPort.instances[0]
    const sessionId = await sessionService.start('smoke test', {
      testMode: true,
      triggerMode: 'time',
      intervalMs: 5000
    })

    expect(sessionService.getState()).toBe('running')
    expect(sessionId).toBeTruthy()

    if (nbmPort.writes.some((w) => w.includes('RESET_MAX'))) {
      nbmPort.emitData('0;\r')
    }

    const summary = await sessionService.stop()
    expect(summary.sampleCount).toBe(0)
    expect(sessionService.getState()).toBe('stopped')
    expect(summary.label).toBe('smoke test')

    await deviceManager.disconnectAll()
    expect(deviceManager.getNBM()).toBeNull()
    expect(deviceManager.getGPS()).toBeNull()
  }, 30000)
})
