import { describe, expect, it } from 'vitest'
import { NBM550Parser } from './NBM550Parser'

describe('NBM550Parser', () => {
  it('parses a measurement response using the configured unit', () => {
    const parser = new NBM550Parser()
    parser.setUnit('W/m^2')

    const sample = parser.parseMeasurement('12.5, 0, 87;\r')

    expect(sample).toMatchObject({
      rss: 12.5,
      unit: 'W/m^2',
      battery: 87
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

  it('extracts device error codes from command responses', () => {
    const parser = new NBM550Parser()

    expect(parser.parseErrorCode('5;\r')).toBe(5)
    expect(parser.parseErrorCode('OK;\r')).toBe(0)
  })
})
