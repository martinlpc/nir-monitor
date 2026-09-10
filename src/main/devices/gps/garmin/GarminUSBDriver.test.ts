import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GarminUSBDriver } from './GarminUSBDriver'
import {
  GARMIN_HEADER_LENGTH,
  GARMIN_LAYER_APPLICATION,
  GARMIN_LAYER_TRANSPORT,
  GARMIN_PID_COMMAND_DATA,
  GARMIN_PID_PRODUCT_DATA,
  GARMIN_PID_PRODUCT_RQST,
  GARMIN_PID_PVT_DATA,
  GARMIN_PID_SESSION_REQ,
  GARMIN_PID_SESSION_RESP,
  GARMIN_PVT_SIZE,
  buildFrame
} from './GarminUSBProtocol'

const mocks = vi.hoisted(() => ({
  findByIds: vi.fn()
}))

vi.mock('usb', () => ({
  findByIds: mocks.findByIds
}))

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const UNIT_ID = 12345678

function unitIdFrame(): Buffer {
  const data = Buffer.alloc(4)
  data.writeUInt32LE(UNIT_ID, 0)
  return buildFrame(GARMIN_LAYER_TRANSPORT, GARMIN_PID_SESSION_RESP, data)
}

function productFrame(): Buffer {
  const data = Buffer.alloc(64)
  data.writeUInt16LE(1, 0)
  data.writeUInt16LE(215, 2)
  data.write('GPS 18x USB', 4, 'ascii')
  return buildFrame(GARMIN_LAYER_APPLICATION, GARMIN_PID_PRODUCT_DATA, data)
}

function pvtFrame(fix = 3, latRad = 0.9, lonRad = -0.5): Buffer {
  const data = Buffer.alloc(GARMIN_PVT_SIZE)
  data.writeFloatLE(123.5, 0)
  data.writeFloatLE(3.2, 4)
  data.writeFloatLE(2.1, 8)
  data.writeFloatLE(4.3, 12)
  data.writeInt16LE(fix, 16)
  data.writeDoubleLE(43212.999, 18)
  data.writeDoubleLE(latRad, 26)
  data.writeDoubleLE(lonRad, 34)
  data.writeFloatLE(10.0, 42)
  data.writeFloatLE(5.0, 46)
  data.writeFloatLE(0.2, 50)
  data.writeFloatLE(-35.0, 54)
  data.writeInt16LE(18, 58)
  data.writeInt32LE(7436, 60)
  return buildFrame(GARMIN_LAYER_APPLICATION, GARMIN_PID_PVT_DATA, data)
}

class MockInEndpoint {
  direction = 'in'
  transferType = 3
  timeout = 0
  totalTransfers = 0
  private queue: Buffer[] = []
  private waiter: { resolve: (buffer: Buffer) => void } | null = null

  transferAsync(): Promise<Buffer> {
    this.totalTransfers++
    const next = this.queue.shift()
    if (next) return Promise.resolve(next)
    return new Promise<Buffer>((resolve) => {
      this.waiter = { resolve }
    })
  }

  push(buffer: Buffer): void {
    if (this.waiter) {
      const resolve = this.waiter.resolve
      this.waiter = null
      setTimeout(() => resolve(buffer), 0)
    } else {
      this.queue.push(buffer)
    }
  }
}

class MockOutEndpoint {
  direction = 'out'
  transferType = 2
  transfers: Buffer[] = []
  autoRespond = true

  constructor(private readonly inEp: MockInEndpoint) {}

  transferAsync(frame: Buffer): Promise<number> {
    this.transfers.push(frame)
    if (!this.autoRespond) return Promise.resolve(frame.length)
    const packetId = frame.readUInt16LE(4)
    if (packetId === GARMIN_PID_SESSION_REQ) {
      this.inEp.push(unitIdFrame())
    } else if (packetId === GARMIN_PID_PRODUCT_RQST) {
      this.inEp.push(productFrame())
    } else if (packetId === GARMIN_PID_COMMAND_DATA) {
      const command = frame.readUInt16LE(GARMIN_HEADER_LENGTH)
      if (command === 49) this.inEp.push(pvtFrame())
      // al pedir detener PVT, resolver el read pendiente del loop de lectura
      if (command === 50) this.inEp.push(pvtFrame(1))
    }
    return Promise.resolve(frame.length)
  }
}

class MockInterface {
  claim = vi.fn()
  release = vi.fn((_closeEndpoints?: boolean, callback?: (error?: Error) => void) => {
    callback?.()
  })
  endpoints: Array<MockInEndpoint | MockOutEndpoint> = []
}

class MockDevice {
  open = vi.fn()
  close = vi.fn()
  interface = vi.fn()

  constructor(public readonly iface: MockInterface) {
    this.interface.mockReturnValue(iface)
  }
}

interface Harness {
  device: MockDevice
  iface: MockInterface
  inEp: MockInEndpoint
  outEp: MockOutEndpoint
}

function makeHarness(): Harness {
  const inEp = new MockInEndpoint()
  const outEp = new MockOutEndpoint(inEp)
  const iface = new MockInterface()
  iface.endpoints = [inEp, outEp]
  const device = new MockDevice(iface)
  return { device, iface, inEp, outEp }
}

describe('GarminUSBDriver', () => {
  beforeEach(() => {
    mocks.findByIds.mockReset()
  })

  it('builds a compatible meta', () => {
    const driver = new GarminUSBDriver({ port: 'garmin-usb' })

    expect(driver.meta.id).toBe('gps-usb')
    expect(driver.meta.name).toBe('Garmin 18x USB')
    expect(driver.meta.type).toBe('gps')
    expect(driver.meta.port).toBe('garmin-usb')
    expect(driver.meta.baudRate).toBe(0)
  })

  it('prefers the interrupt IN endpoint over the bulk one', async () => {
    const bulkIn = new MockInEndpoint()
    bulkIn.transferType = 2
    const interruptIn = new MockInEndpoint()
    interruptIn.transferType = 3
    const outEp = new MockOutEndpoint(interruptIn)
    const iface = new MockInterface()
    iface.endpoints = [bulkIn, outEp, interruptIn]
    const device = new MockDevice(iface)
    mocks.findByIds.mockReturnValue(device)
    const driver = new GarminUSBDriver({ port: 'garmin-usb' })

    await driver.connect()

    expect(driver.status).toBe('connected')
    expect(interruptIn.totalTransfers).toBeGreaterThan(0)
    expect(bulkIn.totalTransfers).toBe(0)
  })

  it('connects and completes the handshake with a PVT record', async () => {
    const harness = makeHarness()
    mocks.findByIds.mockReturnValue(harness.device)
    const driver = new GarminUSBDriver({ port: 'garmin-usb' })

    await driver.connect()

    expect(driver.status).toBe('connected')
    expect(harness.device.open).toHaveBeenCalledTimes(1)
    expect(harness.iface.claim).toHaveBeenCalledTimes(1)
    expect(harness.outEp.transfers).toHaveLength(3)
    expect(driver.meta.port).toBe('garmin-usb:12345678')

    const state = driver.getState()
    expect(state.fixType).toBe('3d')
    expect(state.valid).toBe(true)
    expect(state.position!.lat).toBeCloseTo(0.9 * (180 / Math.PI), 6)
    expect(state.position!.lon).toBeCloseTo(-0.5 * (180 / Math.PI), 6)
    expect(state.position!.alt).toBeCloseTo(88.5, 5)
    expect(driver.isConnected()).toBe(true)
  })

  it('rejects when the device is not present', async () => {
    mocks.findByIds.mockReturnValue(undefined)
    const driver = new GarminUSBDriver({ port: 'garmin-usb' })

    await expect(driver.connect()).rejects.toMatchObject({ code: 'GARMIN_USB_NOT_FOUND' })
    expect(driver.status).toBe('error')
  })

  it('rejects when the interface cannot be claimed', async () => {
    const harness = makeHarness()
    mocks.findByIds.mockReturnValue(harness.device)
    harness.iface.claim.mockImplementation(() => {
      throw new Error('LIBUSB_ERROR_ACCESS')
    })
    const driver = new GarminUSBDriver({ port: 'garmin-usb' })

    await expect(driver.connect()).rejects.toMatchObject({ code: 'GARMIN_USB_CLAIM_FAILED' })
  })

  it('times out when the session does not start', async () => {
    const harness = makeHarness()
    mocks.findByIds.mockReturnValue(harness.device)
    harness.outEp.autoRespond = false
    const driver = new GarminUSBDriver({ port: 'garmin-usb', commandTimeoutMs: 20 })

    await expect(driver.connect()).rejects.toMatchObject({ code: 'GARMIN_USB_HANDSHAKE_FAILED' })
  })

  it('updates the position with each incoming PVT record', async () => {
    const harness = makeHarness()
    mocks.findByIds.mockReturnValue(harness.device)
    const driver = new GarminUSBDriver({ port: 'garmin-usb' })
    await driver.connect()

    harness.inEp.push(pvtFrame(3, 0.5, 1.0))
    await sleep(10)

    expect(driver.getLastPosition()!.lat).toBeCloseTo(0.5 * (180 / Math.PI), 6)
    expect(driver.getLastPosition()!.lon).toBeCloseTo(1.0 * (180 / Math.PI), 6)
  })

  it('flags no-fix records as invalid while keeping the last position', async () => {
    const harness = makeHarness()
    mocks.findByIds.mockReturnValue(harness.device)
    const driver = new GarminUSBDriver({ port: 'garmin-usb' })
    await driver.connect()

    harness.inEp.push(pvtFrame(1))
    await sleep(10)

    expect(driver.isPositionValid()).toBe(false)
    expect(driver.getLastPosition()).not.toBeNull()
  })

  it('emits fix-lost after the configured timeout without new fixes', async () => {
    const harness = makeHarness()
    mocks.findByIds.mockReturnValue(harness.device)
    const driver = new GarminUSBDriver({ port: 'garmin-usb', fixLossTimeoutMs: 40 })
    const fixLost = vi.fn()
    driver.on('fix-lost', fixLost)

    await driver.connect()
    expect(driver.isPositionValid()).toBe(true)

    await sleep(80)

    expect(fixLost).toHaveBeenCalledTimes(1)
    expect(driver.isPositionValid()).toBe(false)
    expect(driver.getLastPosition()).toBeNull()
  })

  it('disconnects and resets the state', async () => {
    const harness = makeHarness()
    mocks.findByIds.mockReturnValue(harness.device)
    const driver = new GarminUSBDriver({ port: 'garmin-usb' })
    await driver.connect()

    await driver.disconnect()

    expect(driver.status).toBe('disconnected')
    expect(driver.isConnected()).toBe(false)
    expect(driver.getLastPosition()).toBeNull()
    expect(driver.getState().valid).toBe(false)
    expect(harness.device.close).toHaveBeenCalledTimes(1)
  })
})
