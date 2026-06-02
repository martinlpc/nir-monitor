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

  it('parses a full 5-field measurement response', () => {
    const parser = new NBM550Parser()

    const sample = parser.parseMeasurement('3.14, 1.2, 0.8, 0, 87;\r')

    expect(sample).toMatchObject({
      rss: 3.14,
      unit: 'V/m',
      battery: 87
    })
  })

  it('returns null for single-value responses (error codes)', () => {
    const parser = new NBM550Parser()

    expect(parser.parseMeasurement('412;\r')).toBeNull()
    expect(parser.parseMeasurement('5;\r')).toBeNull()
    expect(parser.parseMeasurement('0;\r')).toBeNull()
  })

  it('returns null for two-field responses', () => {
    const parser = new NBM550Parser()

    expect(parser.parseMeasurement('412, 0;\r')).toBeNull()
  })

  it('returns null for invalid measurements', () => {
    const parser = new NBM550Parser()

    expect(parser.parseMeasurement('ERR;\r')).toBeNull()
  })

  it('detects error responses (single numeric value, no commas)', () => {
    const parser = new NBM550Parser()

    expect(parser.isErrorResponse('412;\r')).toBe(true)
    expect(parser.isErrorResponse('5;\r')).toBe(true)
    expect(parser.isErrorResponse('0;\r')).toBe(false) // 0 = no error
    expect(parser.isErrorResponse('ERR;\r')).toBe(false) // no es numérico
    expect(parser.isErrorResponse('12.5, 0, 0;\r')).toBe(false) // tiene comas
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

  describe('parseProbeInfo', () => {
    it('parses probe info with complete data', () => {
      const parser = new NBM550Parser()

      const info = parser.parseProbeInfo('"EF-0691",0,"12345","2024-03-15";\r')

      expect(info).toEqual({
        model: 'EF-0691',
        serial: '12345',
        calibrationDate: '2024-03-15'
      })
    })

    it('sets null for missing fields', () => {
      const parser = new NBM550Parser()

      const info = parser.parseProbeInfo('"EF-0691";\r')

      expect(info).toEqual({
        model: 'EF-0691',
        serial: null,
        calibrationDate: null
      })
    })

    it('strips surrounding quotes from fields', () => {
      const parser = new NBM550Parser()

      const info = parser.parseProbeInfo('"EF-0691",0,"12345","2024-03-15";\r')

      expect(info.model).toBe('EF-0691')
      expect(info.model).not.toContain('"')
      expect(info.serial).not.toContain('"')
      expect(info.calibrationDate).not.toContain('"')
    })
  })
})
