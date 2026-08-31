import { describe, expect, it } from 'vitest'
import { inflateRawSync } from 'zlib'

import { KmzExporter } from '../KmzExporter'
import type { GeoTimestamp } from '../../../shared/GeoTimestamp'
import type { SessionSummary } from '../../../shared/ipc.types'

const APP_VERSION = '1.2.3'

function makePoint(seq: number, correctedMeasurement: number): GeoTimestamp {
  return {
    id: `p${seq}`,
    sessionId: 'test-session',
    sequenceNumber: seq,
    timestamp: new Date('2026-08-07T15:00:00Z').getTime(),
    position: { lat: -38.9516, lon: -68.0591, alt: 271 },
    emf: { deviceId: 'nbm550', rawMeasurement: 1.2, unit: 'V/m' },
    correctedMeasurement
  }
}

function makeMetadata(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'test-session',
    label: 'Recorrido test',
    startedAt: new Date('2026-08-07T14:00:00Z').getTime(),
    stoppedAt: new Date('2026-08-07T15:00:00Z').getTime(),
    sampleCount: 2,
    instrument: {
      meter: {
        brand: 'Narda',
        model: 'NBM-550',
        serial: 'SN-001',
        lastCalibrationDate: '2025-01-01'
      },
      probe: {
        brand: 'Narda',
        model: 'EF-0391',
        serial: 'PR-002',
        calibrationDate: '2025-01-01'
      }
    },
    correctionFactor: 1.08,
    provincia: 'Neuquén',
    localidad: 'Plottier',
    ...overrides
  }
}

function zipEntries(zip: Buffer): string[] {
  const eocd = findEocd(zip)
  const total = zip.readUInt16LE(eocd + 10)
  let offset = zip.readUInt32LE(eocd + 16)
  const names: string[] = []
  for (let i = 0; i < total; i++) {
    const nameLen = zip.readUInt16LE(offset + 28)
    names.push(zip.toString('utf8', offset + 46, offset + 46 + nameLen))
    offset += 46 + nameLen + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32)
  }
  return names
}

function extractZipEntry(zip: Buffer, entryName: string): Buffer {
  const eocd = findEocd(zip)
  const total = zip.readUInt16LE(eocd + 10)
  let offset = zip.readUInt32LE(eocd + 16)
  for (let i = 0; i < total; i++) {
    const method = zip.readUInt16LE(offset + 10)
    const compSize = zip.readUInt32LE(offset + 20)
    const nameLen = zip.readUInt16LE(offset + 28)
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLen)
    const localOffset = zip.readUInt32LE(offset + 42)
    offset += 46 + nameLen + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32)
    if (name !== entryName) continue

    const dataStart =
      localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28)
    const data = zip.subarray(dataStart, dataStart + compSize)
    if (method === 8) return inflateRawSync(data)
    return Buffer.from(data)
  }
  throw new Error(`Entry not found in zip: ${entryName}`)
}

function findEocd(zip: Buffer): number {
  let i = zip.length - 22
  while (
    i >= 0 &&
    !(zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 0x05 && zip[i + 3] === 0x06)
  ) {
    i--
  }
  if (i < 0) throw new Error('Invalid zip: EOCD not found')
  return i
}

describe('KmzExporter', () => {
  it('produces a zip with doc.kml and palette.bmp', async () => {
    const exporter = new KmzExporter(APP_VERSION, null)
    const context = {
      sessionId: 'test-session',
      points: [makePoint(1, 0.5), makePoint(2, 40)],
      metadata: makeMetadata(),
      stats: null
    }

    const zip = await exporter.export(context)

    expect(zipEntries(zip)).toEqual(expect.arrayContaining(['doc.kml', 'palette.bmp']))
    expect(zipEntries(zip)).not.toContain('icon.png')
  })

  it('includes icon.png when an icon buffer is provided', async () => {
    const exporter = new KmzExporter(APP_VERSION, Buffer.from('png-data'))
    const zip = await exporter.export({
      sessionId: 'test-session',
      points: [makePoint(1, 0.5)],
      metadata: makeMetadata(),
      stats: null
    })

    expect(zipEntries(zip)).toContain('icon.png')
  })

  it('writes point coordinates into the KML', async () => {
    const exporter = new KmzExporter(APP_VERSION, null)
    const zip = await exporter.export({
      sessionId: 'test-session',
      points: [makePoint(1, 0.5)],
      metadata: makeMetadata(),
      stats: null
    })

    const kml = extractZipEntry(zip, 'doc.kml').toString('utf8')
    expect(kml).toContain('<Point><coordinates>-68.0591,-38.9516,271</coordinates></Point>')
  })

  it('colors points by MEP level and marks over-100% in red', async () => {
    const exporter = new KmzExporter(APP_VERSION, null)
    const zip = await exporter.export({
      sessionId: 'test-session',
      points: [makePoint(1, 0.5), makePoint(2, 40)],
      metadata: makeMetadata(),
      stats: null
    })

    const kml = extractZipEntry(zip, 'doc.kml').toString('utf8')
    expect(kml).toContain('9aFBC273') // 0.5 V/m -> <=1% -> #73C2FB
    expect(kml).toContain('9a0000FF') // 40 V/m -> >100% -> #FF0000
    expect(kml).toContain('<StyleMap id="icon_0">')
    expect(kml).toContain('<StyleMap id="icon_1">')
  })

  it('embeds session metadata, instrument and app version in the KML', async () => {
    const exporter = new KmzExporter(APP_VERSION, null)
    const zip = await exporter.export({
      sessionId: 'test-session',
      points: [makePoint(1, 0.5)],
      metadata: makeMetadata(),
      stats: null
    })

    const kml = extractZipEntry(zip, 'doc.kml').toString('utf8')
    expect(kml).toContain('Neuquén - Plottier')
    expect(kml).toContain('Sesión: Recorrido test')
    expect(kml).toContain('Medidor: Narda NBM-550')
    expect(kml).toContain('Factor de corrección: 1.08')
    expect(kml).toContain(`RNI Monitor v${APP_VERSION}`)
  })

  it('uses the label as layer name when location is missing', async () => {
    const exporter = new KmzExporter(APP_VERSION, null)
    const zip = await exporter.export({
      sessionId: 'test-session',
      points: [makePoint(1, 0.5)],
      metadata: makeMetadata({ provincia: undefined, localidad: undefined }),
      stats: null
    })

    const kml = extractZipEntry(zip, 'doc.kml').toString('utf8')
    expect(kml).toContain('<name>Recorrido test</name>')
  })

  it('writes corrected measurement only when a correction factor exists', async () => {
    const exporter = new KmzExporter(APP_VERSION, null)
    const zip = await exporter.export({
      sessionId: 'test-session',
      points: [makePoint(1, 0.5)],
      metadata: makeMetadata(),
      stats: null
    })
    const kml = extractZipEntry(zip, 'doc.kml').toString('utf8')
    expect(kml).toContain('<Data name="correctedMeasurement"><value>0.50</value></Data>')

    const zipNoCf = await exporter.export({
      sessionId: 'test-session',
      points: [makePoint(1, 0.5)],
      metadata: makeMetadata({ correctionFactor: null }),
      stats: null
    })
    const kmlNoCf = extractZipEntry(zipNoCf, 'doc.kml').toString('utf8')
    expect(kmlNoCf).toContain('<Data name="correctedMeasurement"><value></value></Data>')
  })

  it('builds a valid BMP palette', async () => {
    const exporter = new KmzExporter(APP_VERSION, null)
    const zip = await exporter.export({
      sessionId: 'test-session',
      points: [makePoint(1, 0.5)],
      metadata: makeMetadata(),
      stats: null
    })

    const bmp = extractZipEntry(zip, 'palette.bmp')
    expect(bmp.subarray(0, 2).toString()).toBe('BM')
    expect(bmp.length).toBeGreaterThan(54)
  })

  it('throws when metadata is missing', async () => {
    const exporter = new KmzExporter(APP_VERSION, null)
    await expect(
      exporter.export({ sessionId: 'test-session', points: [], metadata: null, stats: null })
    ).rejects.toThrow('Session metadata is required for KMZ export')
  })
})
