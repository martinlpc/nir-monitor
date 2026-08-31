import { describe, expect, it } from 'vitest'
import { v4 as uuidv4 } from 'uuid'
import { GeoJsonExporter } from '../GeoJsonExporter'
import type { ExportContext } from '../IExporter'
import type { GeoTimestamp } from '../../../shared/GeoTimestamp'

const NEUQUEN = { lat: -38.9516, lon: -68.0591, alt: 271 }

function makePoint(overrides: Partial<GeoTimestamp> = {}): GeoTimestamp {
  return {
    id: uuidv4(),
    sessionId: '',
    sequenceNumber: 1,
    timestamp: Date.now(),
    position: { ...NEUQUEN },
    emf: { deviceId: 'nbm550', rawMeasurement: 5.0, unit: 'V/m' },
    correctedMeasurement: 5.4,
    ...overrides
  }
}

function makeContext(overrides: Partial<ExportContext> = {}): ExportContext {
  const id = uuidv4()
  const defaultMetadata = {
    id,
    label: 'Recorrido test',
    startedAt: Date.now() - 60000,
    stoppedAt: Date.now(),
    sampleCount: 0,
    instrument: {
      meter: {
        brand: 'Narda',
        model: 'NBM-550',
        serial: 'SN-001',
        lastCalibrationDate: '2025-01-01T00:00:00Z'
      },
      probe: {
        brand: 'Narda',
        model: 'EF0391',
        serial: 'PROBE-001',
        calibrationDate: '2025-01-01T00:00:00Z'
      }
    },
    correctionFactor: 1.08
  }
  const { metadata: metadataOverrides, ...restOverrides } = overrides
  const metadata =
    metadataOverrides === undefined
      ? { ...defaultMetadata }
      : metadataOverrides === null
        ? null
        : { ...defaultMetadata, ...metadataOverrides }
  return {
    sessionId: id,
    points: [],
    metadata,
    stats: null,
    ...restOverrides
  }
}

describe('GeoJsonExporter', () => {
  it('exports as valid GeoJSON FeatureCollection', async () => {
    const exporter = new GeoJsonExporter()
    const sessionId = uuidv4()
    const context = makeContext({
      sessionId,
      points: [
        makePoint({ sessionId, sequenceNumber: 1 }),
        makePoint({ sessionId, sequenceNumber: 2 })
      ],
      metadata: {
        id: sessionId,
        label: 'Recorrido test',
        startedAt: Date.now() - 60000,
        stoppedAt: Date.now(),
        sampleCount: 2,
        instrument: {
          meter: {
            brand: 'Narda',
            model: 'NBM-550',
            serial: 'SN-001',
            lastCalibrationDate: '2025-01-01T00:00:00Z'
          },
          probe: {
            brand: 'Narda',
            model: 'EF0391',
            serial: 'PROBE-001',
            calibrationDate: '2025-01-01T00:00:00Z'
          }
        },
        correctionFactor: 1.08
      },
      stats: { avgCorrected: 5.4, maxCorrected: 5.4, minCorrected: 5.4, pointCount: 2 }
    })

    const output = await exporter.export(context)
    const parsed = JSON.parse(output)
    expect(parsed.type).toBe('FeatureCollection')
    expect(parsed.features).toHaveLength(2)
    expect(parsed.properties.session.id).toBe(sessionId)
    expect(parsed.properties.session.provincia).toBeNull()
    expect(parsed.properties.correctionFactor).toBe(1.08)
    expect(parsed.properties.stats.pointCount).toBe(2)
    expect(parsed.features[0].geometry.type).toBe('Point')
    expect(parsed.features[0].geometry.coordinates).toHaveLength(3)
  })

  it('includes all point fields in features', async () => {
    const exporter = new GeoJsonExporter()
    const point = makePoint({
      sequenceNumber: 7,
      correctedMeasurement: 12.3,
      gpsGap: true
    })
    const context = makeContext({
      sessionId: point.sessionId,
      points: [point]
    })

    const output = await exporter.export(context)
    const parsed = JSON.parse(output)
    const feature = parsed.features[0]
    expect(feature.properties.sequenceNumber).toBe(7)
    expect(feature.properties.correctedMeasurement).toBe(12.3)
    expect(feature.properties.gpsGap).toBe(true)
    expect(feature.properties.datetime).toBeDefined()
  })

  it('works without metadata', async () => {
    const exporter = new GeoJsonExporter()
    const context = makeContext({
      metadata: null,
      points: [makePoint()]
    })

    const output = await exporter.export(context)
    const parsed = JSON.parse(output)
    expect(parsed.type).toBe('FeatureCollection')
    expect(parsed.properties.session.id).toBe(context.sessionId)
    expect(parsed.properties.session.label).toBeNull()
    expect(parsed.properties.instrument.meter.brand).toBeNull()
    expect(parsed.properties.stats).toBeNull()
  })
})
