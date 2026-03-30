import { describe, expect, it } from 'vitest'
import { NBM550Parser } from './NBM550Parser'

describe('NBM550Parser', () => {
  it('parses a measurement response using the configured unit', () => {
    const parser = new NBM550Parser()
    parser.setUnit('W/m^2')

    const sample = parser.parseMeasurement('12.5, 0, 0;\r')

    expect(sample).toMatchObject({
      rss: 12.5,
      unit: 'W/m^2',
      battery: 100
    })
  })

  it('returns null for invalid measurements', () => {
    const parser = new NBM550Parser()

    expect(parser.parseMeasurement('ERR;\r')).toBeNull()
  })

  it('accepts only supported result units', () => {
    const parser = new NBM550Parser()

    expect(parser.parseUnit('V/m;\r')).toBe('V/m')
    expect(parser.parseUnit('invalid-unit;\r')).toBeNull()
  })

  it('parses battery level from response', () => {
    const parser = new NBM550Parser()

    expect(parser.parseBattery('87;\r')).toBe(87)
    expect(parser.parseBattery('100;\r')).toBe(100)
    expect(parser.parseBattery('0;\r')).toBe(0)
    expect(parser.parseBattery('150;\r')).toBeNull() // Out of range
    expect(parser.parseBattery('-5;\r')).toBeNull() // Out of range
    expect(parser.parseBattery('invalid;\r')).toBeNull()
  })

  it('extracts device error codes from command responses', () => {
    const parser = new NBM550Parser()

    expect(parser.parseErrorCode('5;\r')).toBe(5)
    expect(parser.parseErrorCode('OK;\r')).toBe(0)
  })
})
