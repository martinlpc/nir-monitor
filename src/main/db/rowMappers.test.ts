import { describe, expect, it } from 'vitest'
import {
  unixToISO,
  isoToUnix,
  rowToGeoTimestamp,
  rowToSessionSummary,
  rowToSessionStats,
  rowToObject
} from './rowMappers'

const SESSION_COLUMNS = [
  'id',
  'label',
  'startedAt',
  'stoppedAt',
  'sampleCount',
  'correctionFactor',
  'instrument',
  'provincia',
  'localidad',
  'apellido1',
  'apellido2'
]

describe('unixToISO / isoToUnix', () => {
  const ts = Date.UTC(2026, 7, 31, 12, 0, 0)
  it('roundtrips a timestamp', () => {
    expect(isoToUnix(unixToISO(ts))).toBe(ts)
  })
  it('produces ISO 8601', () => {
    expect(unixToISO(ts)).toBe('2026-08-31T12:00:00.000Z')
  })
})

describe('rowToObject', () => {
  it('maps values by column name', () => {
    expect(rowToObject(['a', 1, true], ['x', 'y', 'z'])).toEqual({ x: 'a', y: 1, z: true })
  })
})

describe('rowToSessionSummary', () => {
  it('maps a row to a SessionSummary', () => {
    const row = [
      's1',
      'Recorrido',
      '2026-08-31T12:00:00.000Z',
      '2026-08-31T12:10:00.000Z',
      5,
      1.25,
      JSON.stringify({ model: 'EF0391' }),
      'Buenos Aires',
      'CABA',
      'Perez',
      'Gomez'
    ]
    const summary = rowToSessionSummary(row, SESSION_COLUMNS)
    expect(summary.id).toBe('s1')
    expect(summary.label).toBe('Recorrido')
    expect(summary.sampleCount).toBe(5)
    expect(summary.correctionFactor).toBe(1.25)
    expect(summary.startedAt).toBe(Date.UTC(2026, 7, 31, 12, 0, 0))
    expect(summary.stoppedAt).toBe(Date.UTC(2026, 7, 31, 12, 10, 0, 0))
    expect(summary.instrument).toEqual({ model: 'EF0391' })
    expect(summary.provincia).toBe('Buenos Aires')
  })

  it('maps null optional fields', () => {
    const summary = rowToSessionSummary(
      ['s2', 'X', '2026-01-01T00:00:00.000Z', null, 0, null, null, null, null, null, null],
      SESSION_COLUMNS
    )
    expect(summary.stoppedAt).toBeNull()
    expect(summary.correctionFactor).toBeNull()
    expect(summary.instrument).toBeNull()
  })
})

describe('rowToSessionStats', () => {
  const columns = ['avgCorrected', 'maxCorrected', 'minCorrected', 'pointCount']
  it('maps a row to SessionStats', () => {
    expect(rowToSessionStats([10, 50, 1, 7], columns)).toEqual({
      avgCorrected: 10,
      maxCorrected: 50,
      minCorrected: 1,
      pointCount: 7
    })
  })
})

describe('rowToGeoTimestamp', () => {
  const columns = [
    'id',
    'sessionId',
    'sequenceNumber',
    'timestamp',
    'lat',
    'lon',
    'alt',
    'rawMeasurement',
    'correctedMeasurement',
    'unit',
    'gps_gap'
  ]

  it('maps a geo point row', () => {
    const point = rowToGeoTimestamp(
      ['p1', 's1', 1, '2026-08-31T12:00:00.000Z', -34.6, -58.4, 22, 6.5, 7.0, 'V/m', 1],
      columns
    )
    expect(point.id).toBe('p1')
    expect(point.sessionId).toBe('s1')
    expect(point.sequenceNumber).toBe(1)
    expect(point.timestamp).toBe(Date.UTC(2026, 7, 31, 12, 0, 0))
    expect(point.position).toEqual({ lat: -34.6, lon: -58.4, alt: 22 })
    expect(point.emf.rawMeasurement).toBe(6.5)
    expect(point.emf.unit).toBe('V/m')
    expect(point.correctedMeasurement).toBe(7.0)
    expect(point.gpsGap).toBe(true)
  })

  it('reads legacy NULL alt as zero and gpsGap as undefined when 0', () => {
    const point = rowToGeoTimestamp(
      ['p2', 's1', 2, '2026-08-31T12:00:00.000Z', -34.6, -58.4, null, 6.5, 7.0, 'V/m', 0],
      columns
    )
    expect(point.position.alt).toBe(0)
    expect(point.gpsGap).toBeUndefined()
  })
})
