import { describe, expect, it } from 'vitest'
import { decodePVT, GARMIN_PVT_SIZE } from './GarminUSBProtocol'
import {
  fixToFixType,
  garminPVTToGeoPosition,
  pvtHeadingDeg,
  pvtSpeedKmh,
  pvtUtcMs
} from './pvtToGeoPosition'

function pvtBuffer(fix: number, gpsTow = 43212.999): Buffer {
  const data = Buffer.alloc(GARMIN_PVT_SIZE)
  data.writeFloatLE(123.5, 0)
  data.writeInt16LE(fix, 16)
  data.writeDoubleLE(gpsTow, 18)
  data.writeDoubleLE(0.9, 26)
  data.writeDoubleLE(-0.5, 34)
  data.writeFloatLE(10.0, 42)
  data.writeFloatLE(5.0, 46)
  data.writeFloatLE(0.2, 50)
  data.writeFloatLE(-35.0, 54)
  data.writeInt16LE(18, 58)
  data.writeInt32LE(7436, 60)
  return data
}

describe('fixToFixType', () => {
  it('maps 2d fix codes', () => {
    expect(fixToFixType(2)).toBe('2d')
    expect(fixToFixType(4)).toBe('2d')
  })

  it('maps 3d fix codes', () => {
    expect(fixToFixType(3)).toBe('3d')
    expect(fixToFixType(5)).toBe('3d')
  })

  it('maps no-fix codes', () => {
    expect(fixToFixType(0)).toBe('none')
    expect(fixToFixType(1)).toBe('none')
  })
})

describe('pvtUtcMs', () => {
  it('converts gps epoch + week days + tow - leap to unix ms', () => {
    const pvt = decodePVT(pvtBuffer(3))!

    const expected = Math.round((631065600 + 7436 * 86400 + 43213 - 18) * 1000)
    expect(pvtUtcMs(pvt)).toBe(expected)
  })
})

describe('pvtSpeedKmh', () => {
  it('computes ground speed from east/north velocities', () => {
    const pvt = decodePVT(pvtBuffer(3))!

    expect(pvtSpeedKmh(pvt)).toBeCloseTo(3.6 * Math.hypot(10, 5), 6)
  })
})

describe('pvtHeadingDeg', () => {
  it('returns heading from north in degrees', () => {
    const pvt = decodePVT(pvtBuffer(3))!

    expect(pvtHeadingDeg(pvt)).toBeCloseTo(63.4349, 3)
  })
})

describe('garminPVTToGeoPosition', () => {
  it('maps a valid fix to a GeoPosition with MSL altitude', () => {
    const pvt = decodePVT(pvtBuffer(3))!
    const position = garminPVTToGeoPosition(pvt)

    expect(position).not.toBeNull()
    expect(position!.lat).toBeCloseTo(0.9 * (180 / Math.PI), 6)
    expect(position!.lon).toBeCloseTo(-0.5 * (180 / Math.PI), 6)
    expect(position!.alt).toBeCloseTo(123.5 - 35, 6)
    expect(position!.speed).toBeCloseTo(3.6 * Math.hypot(10, 5), 6)
    expect(position!.heading).toBeCloseTo(63.4349, 3)
    expect(position!.nmeaUtcMs).toBe(pvtUtcMs(pvt))
  })

  it('omits speed when the device is stationary', () => {
    const data = Buffer.alloc(GARMIN_PVT_SIZE)
    data.writeFloatLE(100, 0)
    data.writeInt16LE(3, 16)
    data.writeDoubleLE(0.9, 26)
    data.writeDoubleLE(-0.5, 34)
    const pvt = decodePVT(data)!

    expect(garminPVTToGeoPosition(pvt)!.speed).toBeUndefined()
  })

  it('returns null for no-fix records', () => {
    expect(garminPVTToGeoPosition(decodePVT(pvtBuffer(1))!)).toBeNull()
  })
})
