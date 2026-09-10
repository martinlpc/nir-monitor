import { describe, expect, it } from 'vitest'
import {
  GARMIN_HEADER_LENGTH,
  GARMIN_LAYER_APPLICATION,
  GARMIN_LAYER_TRANSPORT,
  GARMIN_PID_COMMAND_DATA,
  GARMIN_PID_PRODUCT_RQST,
  GARMIN_PID_SESSION_REQ,
  GARMIN_PVT_SIZE,
  buildFrame,
  decodeProductData,
  decodePVT,
  decodeUnitId,
  parseFrame,
  productDataRequestFrame,
  startPvtFrame,
  startSessionFrame,
  stopPvtFrame
} from './GarminUSBProtocol'

function pvtBuffer(overrides: { gpsTow?: number; latRad?: number; lonRad?: number } = {}): Buffer {
  const data = Buffer.alloc(GARMIN_PVT_SIZE)
  data.writeFloatLE(123.5, 0)
  data.writeFloatLE(3.2, 4)
  data.writeFloatLE(2.1, 8)
  data.writeFloatLE(4.3, 12)
  data.writeInt16LE(3, 16)
  data.writeDoubleLE(overrides.gpsTow ?? 43212.999, 18)
  data.writeDoubleLE(overrides.latRad ?? 0.9, 26)
  data.writeDoubleLE(overrides.lonRad ?? -0.5, 34)
  data.writeFloatLE(10.0, 42)
  data.writeFloatLE(5.0, 46)
  data.writeFloatLE(0.2, 50)
  data.writeFloatLE(-35.0, 54)
  data.writeInt16LE(18, 58)
  data.writeInt32LE(7436, 60)
  return data
}

describe('buildFrame', () => {
  it('builds a minimal header-only frame', () => {
    const frame = buildFrame(GARMIN_LAYER_TRANSPORT, GARMIN_PID_SESSION_REQ)

    expect(frame.length).toBe(GARMIN_HEADER_LENGTH)
    expect(frame[0]).toBe(GARMIN_LAYER_TRANSPORT)
    expect(frame.readUInt16LE(4)).toBe(GARMIN_PID_SESSION_REQ)
    expect(frame.readUInt32LE(8)).toBe(0)
  })

  it('appends payload and sets data size', () => {
    const payload = Buffer.from([1, 2, 3])
    const frame = buildFrame(GARMIN_LAYER_APPLICATION, GARMIN_PID_COMMAND_DATA, payload)

    expect(frame.length).toBe(GARMIN_HEADER_LENGTH + 3)
    expect(frame[0]).toBe(GARMIN_LAYER_APPLICATION)
    expect(frame.readUInt32LE(8)).toBe(3)
    expect(frame.subarray(GARMIN_HEADER_LENGTH)).toEqual(payload)
  })
})

describe('parseFrame', () => {
  it('parses a frame back into its fields', () => {
    const payload = Buffer.from([49, 0])
    const frame = parseFrame(buildFrame(GARMIN_LAYER_APPLICATION, GARMIN_PID_COMMAND_DATA, payload))

    expect(frame).toEqual({
      packetType: GARMIN_LAYER_APPLICATION,
      packetId: GARMIN_PID_COMMAND_DATA,
      dataSize: 2,
      data: payload
    })
  })

  it('returns null for buffers shorter than the header', () => {
    expect(parseFrame(Buffer.alloc(4))).toBeNull()
  })

  it('returns null when the payload is truncated', () => {
    const header = Buffer.alloc(GARMIN_HEADER_LENGTH)
    header.writeUInt32LE(10, 8)
    expect(parseFrame(header)).toBeNull()
  })
})

describe('command frames', () => {
  it('start session uses the transport layer', () => {
    const frame = startSessionFrame()

    expect(frame[0]).toBe(GARMIN_LAYER_TRANSPORT)
    expect(frame.readUInt16LE(4)).toBe(GARMIN_PID_SESSION_REQ)
  })

  it('product data request uses the application layer', () => {
    const frame = productDataRequestFrame()

    expect(frame[0]).toBe(GARMIN_LAYER_APPLICATION)
    expect(frame.readUInt16LE(4)).toBe(GARMIN_PID_PRODUCT_RQST)
  })

  it('start pvt carries command 49 in the payload', () => {
    const frame = startPvtFrame()

    expect(frame[0]).toBe(GARMIN_LAYER_APPLICATION)
    expect(frame.readUInt16LE(4)).toBe(GARMIN_PID_COMMAND_DATA)
    expect(frame.readUInt16LE(GARMIN_HEADER_LENGTH)).toBe(49)
  })

  it('stop pvt carries command 50 in the payload', () => {
    expect(stopPvtFrame().readUInt16LE(GARMIN_HEADER_LENGTH)).toBe(50)
  })
})

describe('decodeUnitId', () => {
  it('reads the unit id as uint32 LE', () => {
    const data = Buffer.alloc(4)
    data.writeUInt32LE(0x10203040, 0)

    expect(decodeUnitId(data)).toBe(0x10203040)
  })
})

describe('decodeProductData', () => {
  it('decodes product id, version and name', () => {
    const data = Buffer.alloc(64)
    data.writeUInt16LE(0x0454, 0)
    data.writeUInt16LE(215, 2)
    data.write('GPS 18x USB', 4, 'ascii')

    const product = decodeProductData(data)

    expect(product.productId).toBe(0x0454)
    expect(product.softwareVersion).toBe(2.15)
    expect(product.productName).toBe('GPS 18x USB')
  })

  it('trims trailing characters after the name', () => {
    const data = Buffer.alloc(32)
    data.write('Sensor\x00\x00\x00', 4, 'ascii')

    expect(decodeProductData(data).productName).toBe('Sensor')
  })
})

describe('decodePVT', () => {
  it('decodes all fields at the documented offsets', () => {
    const pvt = decodePVT(pvtBuffer())

    expect(pvt).not.toBeNull()
    expect(pvt!.alt).toBeCloseTo(123.5, 5)
    expect(pvt!.epe).toBeCloseTo(3.2, 5)
    expect(pvt!.eph).toBeCloseTo(2.1, 5)
    expect(pvt!.epv).toBeCloseTo(4.3, 5)
    expect(pvt!.fix).toBe(3)
    expect(pvt!.gpsTow).toBeCloseTo(43212.999, 6)
    expect(pvt!.latRad).toBeCloseTo(0.9, 6)
    expect(pvt!.lonRad).toBeCloseTo(-0.5, 6)
    expect(pvt!.eastVel).toBeCloseTo(10.0, 5)
    expect(pvt!.northVel).toBeCloseTo(5.0, 5)
    expect(pvt!.upVel).toBeCloseTo(0.2, 5)
    expect(pvt!.mslHght).toBeCloseTo(-35.0, 5)
    expect(pvt!.leapSec).toBe(18)
    expect(pvt!.grmnDays).toBe(7436)
  })

  it('returns null for buffers smaller than the PVT size', () => {
    expect(decodePVT(Buffer.alloc(GARMIN_PVT_SIZE - 1))).toBeNull()
  })
})
