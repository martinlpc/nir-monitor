import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { NBM550Driver } from './NBM550Driver'

const { portInstances, FakeSerialPort } = vi.hoisted(() => {
  class FakeSerialPort {
    writes: string[] = []
    isOpen = false
    dataListeners: Array<(chunk: Buffer) => void> = []
    errorListeners: Array<(err: Error) => void> = []
    closeListeners: Array<() => void> = []
    static openShouldFail: Error | null = null

    constructor() {
      portInstances.push(this)
    }

    on(event: string, fn: (...args: unknown[]) => void): this {
      if (event === 'data') this.dataListeners.push(fn as (chunk: Buffer) => void)
      if (event === 'error') this.errorListeners.push(fn as (err: Error) => void)
      if (event === 'close') this.closeListeners.push(fn as () => void)
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

  const portInstances: FakeSerialPort[] = []
  return { portInstances, FakeSerialPort }
})

vi.mock('serialport', () => ({
  SerialPort: FakeSerialPort
}))

function createDriver(port = 'COM3'): NBM550Driver {
  return new NBM550Driver({ port, baudRate: 460800, pollIntervalMs: 200, unit: 'V/m' })
}

/**
 * Connects using real timers (slow, 8s+). Only used for the connect-sequence tests.
 */
async function connectDriverReal(d: NBM550Driver): Promise<void> {
  vi.useRealTimers()
  const p = d.connect()
  const port = portInstances[0]

  await vi.waitFor(() => expect(port.writes.some((w) => w.includes('REMOTE ON'))).toBe(true), {
    timeout: 5000,
    interval: 100
  })
  port.emitData('0;\r')

  await vi.waitFor(() => expect(port.writes.some((w) => w.includes('SAMPLE_RATE'))).toBe(true), {
    timeout: 5000,
    interval: 100
  })
  port.emitData('0;\r')

  await vi.waitFor(() => expect(port.writes.some((w) => w.includes('MEAS_VIEW'))).toBe(true), {
    timeout: 2000,
    interval: 50
  })
  port.emitData('0;\r')

  await vi.waitFor(() => expect(port.writes.some((w) => w.includes('RESULT_TYPE'))).toBe(true), {
    timeout: 2000,
    interval: 50
  })
  port.emitData('0;\r')

  await vi.waitFor(() => expect(port.writes.some((w) => w.includes('RESULT_UNIT '))).toBe(true), {
    timeout: 2000,
    interval: 50
  })
  port.emitData('0;\r')

  await vi.waitFor(() => expect(port.writes.some((w) => w.includes('RESULT_UNIT?'))).toBe(true), {
    timeout: 2000,
    interval: 50
  })
  port.emitData('V/m;\r')

  await vi.waitFor(() => expect(port.writes.some((w) => w.includes('PROBE_INFO?'))).toBe(true), {
    timeout: 2000,
    interval: 50
  })
  port.emitData('"EF-0691",0,"12345","2024-03-15";\r')

  await p
  vi.useFakeTimers()
}

/**
 * Sets up connected driver state directly (fast, no real delays).
 * Injects a fake port into the driver's private fields.
 */
function setupConnectedDriver(): { driver: NBM550Driver; port: FakeSerialPort } {
  const d = createDriver()
  const port = new FakeSerialPort()
  port.isOpen = true
  ;(d as any).port = port
  ;(d as any).status = 'connected'
  ;(d as any).attachDataListener()
  ;(d as any).probeInfo = {
    model: 'EF-0691',
    serial: '12345',
    calibrationDate: '2024-03-15'
  }
  ;(d as any).responseBuffer = ''
  ;(d as any).consecutiveTimeouts = 0
  ;(d as any).currentBattery = 100
  ;(d as any).queryQueue = Promise.resolve()
  return { driver: d, port }
}

let driver: NBM550Driver

beforeEach(() => {
  vi.useFakeTimers()
  portInstances.length = 0
  driver = createDriver()
})

afterEach(() => {
  vi.useRealTimers()
  FakeSerialPort.openShouldFail = null
})

describe('NBM550Driver', () => {
  // ── quickProbe ──

  it('quickProbe opens port and sends REMOTE ON', async () => {
    vi.useRealTimers()
    const probePromise = driver.quickProbe()
    const port = portInstances[0]

    await vi.waitFor(() => expect(port.writes.some((w) => w.includes('REMOTE ON'))).toBe(true), {
      timeout: 5000,
      interval: 100
    })
    port.emitData('0;\r')

    await probePromise
    expect(driver.status).toBe('connecting')
    vi.useFakeTimers()
  })

  it('quickProbe sets error when port open fails', async () => {
    FakeSerialPort.openShouldFail = new Error('port busy')

    await expect(driver.quickProbe()).rejects.toThrow('port busy')
    expect(driver.status).toBe('error')
  })

  // ── connect ──

  it('connect sends full init sequence and sets connected status', async () => {
    await connectDriverReal(driver)
    const port = portInstances[0]

    expect(driver.status).toBe('connected')
    expect(port.writes.some((w) => w.includes('REMOTE ON'))).toBe(true)
    expect(port.writes.some((w) => w.includes('SAMPLE_RATE'))).toBe(true)
    expect(port.writes.some((w) => w.includes('MEAS_VIEW'))).toBe(true)
    expect(port.writes.some((w) => w.includes('RESULT_TYPE'))).toBe(true)
    expect(port.writes.some((w) => w.includes('RESULT_UNIT'))).toBe(true)
    expect(port.writes.some((w) => w.includes('PROBE_INFO?'))).toBe(true)
  })

  it('connect reads and stores probe info', async () => {
    await connectDriverReal(driver)

    const info = driver.getProbeInfo()
    expect(info).toMatchObject({
      model: 'EF-0691',
      serial: '12345',
      calibrationDate: '2024-03-15'
    })
  })

  it('connect sets status to error when serial port open fails', async () => {
    FakeSerialPort.openShouldFail = new Error('ACCESS_DENIED')

    await expect(driver.connect()).rejects.toThrow('ACCESS_DENIED')
    expect(driver.status).toBe('error')
  })

  // ── disconnect ──

  it('disconnect sends REMOTE OFF and closes port', async () => {
    const { driver: d, port } = setupConnectedDriver()

    const discPromise = d.disconnect()
    await vi.advanceTimersByTimeAsync(0)

    expect(port.writes.some((w) => w.includes('REMOTE OFF'))).toBe(true)
    port.emitData('0;\r')
    await discPromise

    expect(d.status).toBe('disconnected')
  })

  it('disconnect works even if port was never opened', async () => {
    await expect(driver.disconnect()).resolves.toBeUndefined()
    expect(driver.status).toBe('disconnected')
  })

  // ── isConnected ──

  it('isConnected returns true when connected and port is open', () => {
    expect(driver.isConnected()).toBe(false)

    const { driver: d } = setupConnectedDriver()
    expect(d.isConnected()).toBe(true)
  })

  // ── readMeasurement ──

  it('readMeasurement sends MEAS? and returns parsed sample', async () => {
    const { driver: d, port } = setupConnectedDriver()

    const samplePromise = d.readMeasurement()
    await vi.advanceTimersByTimeAsync(0)

    expect(port.writes.some((w) => w.includes('MEAS?'))).toBe(true)
    port.emitData('12.5, 0, 0, 0, 95;\r')

    const sample = await samplePromise
    expect(sample).toMatchObject({ rss: 12.5, unit: 'V/m', battery: 100 })
  })

  it('readMeasurement returns null on timeout', async () => {
    const { driver: d } = setupConnectedDriver()

    const samplePromise = d.readMeasurement()
    await vi.advanceTimersByTimeAsync(6000)

    const sample = await samplePromise
    expect(sample).toBeNull()
  })

  it('readMeasurement detects NBM error codes', async () => {
    const { driver: d, port } = setupConnectedDriver()
    const errorSpy = vi.fn()
    d.on('error', errorSpy)

    const samplePromise = d.readMeasurement()
    await vi.advanceTimersByTimeAsync(0)

    port.emitData('412;\r')

    const sample = await samplePromise
    expect(sample).toBeNull()
    expect(d.status).toBe('error')
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'NBM-550 error code 412' })
    )
  })

  it('readMeasurement returns null when port is not open', async () => {
    const sample = await driver.readMeasurement()
    expect(sample).toBeNull()
  })

  // ── readBattery ──

  it('readBattery sends BATTERY? and returns parsed value', async () => {
    const { driver: d, port } = setupConnectedDriver()

    const batteryPromise = d.readBattery()
    await vi.advanceTimersByTimeAsync(0)

    expect(port.writes.some((w) => w.includes('BATTERY?'))).toBe(true)
    port.emitData('87;\r')

    const battery = await batteryPromise
    expect(battery).toBe(87)
  })

  it('readBattery updates currentBattery for subsequent measurements', async () => {
    const { driver: d, port } = setupConnectedDriver()

    const battPromise = d.readBattery()
    await vi.advanceTimersByTimeAsync(0)
    port.emitData('75;\r')
    await battPromise

    const samplePromise = d.readMeasurement()
    await vi.advanceTimersByTimeAsync(0)
    port.emitData('10.0, 0, 0, 0, 99;\r')

    const sample = await samplePromise
    expect(sample?.battery).toBe(75)
  })

  // ── resetMaxHold ──

  it('resetMaxHold sends RESET_MAX command', async () => {
    const { driver: d, port } = setupConnectedDriver()

    const promise = d.resetMaxHold()
    await vi.advanceTimersByTimeAsync(0)

    expect(port.writes.some((w) => w.includes('RESET_MAX'))).toBe(true)
    port.emitData('0;\r')
    await promise
  })

  // ── getProbeInfo ──

  it('getProbeInfo returns null before connect', () => {
    expect(driver.getProbeInfo()).toBeNull()
  })

  // ── Serial port events ──

  it('emits error and sets status to error on serial port error event', () => {
    const { driver: d, port } = setupConnectedDriver()
    const errorSpy = vi.fn()
    d.on('error', errorSpy)

    port.emitError(new Error('port disconnected'))

    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'port disconnected' }))
    expect(d.status).toBe('error')
  })

  it('sets disconnected on serial port close', () => {
    const { driver: d, port } = setupConnectedDriver()

    port.emitClose()
    expect(d.status).toBe('disconnected')
  })

  // ── Accumulated chunks ──

  it('accumulates partial data chunks until semicolon', async () => {
    const { driver: d, port } = setupConnectedDriver()

    const samplePromise = d.readMeasurement()
    await vi.advanceTimersByTimeAsync(0)
    port.emitData('12.')
    port.emitData('5, 0, 0, 0, 95;\r')

    const sample = await samplePromise
    expect(sample).toMatchObject({ rss: 12.5 })
  })

  // ── Consecutive timeout → error ──

  it('transitions to error after 4 consecutive timeouts', async () => {
    const { driver: d } = setupConnectedDriver()
    const errorSpy = vi.fn()
    d.on('error', errorSpy)

    for (let i = 0; i < 4; i++) {
      const p = d.readMeasurement()
      await vi.advanceTimersByTimeAsync(6000)
      await expect(p).resolves.toBeNull()
    }

    expect(d.status).toBe('error')
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('timeouts') })
    )
  })
})
