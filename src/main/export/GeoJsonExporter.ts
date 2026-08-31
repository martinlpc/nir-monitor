import type { ExportContext, IExporter } from './IExporter'

export class GeoJsonExporter implements IExporter<string> {
  async export(context: ExportContext): Promise<string> {
    const { sessionId, points, metadata, stats } = context
    const features = points.map((point) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [point.position.lon, point.position.lat, point.position.alt]
      },
      properties: {
        id: point.id,
        sequenceNumber: point.sequenceNumber,
        timestamp: point.timestamp,
        datetime: new Date(point.timestamp).toISOString(),
        rawMeasurement: point.emf.rawMeasurement,
        correctedMeasurement: point.correctedMeasurement,
        unit: point.emf.unit,
        gpsGap: point.gpsGap ?? false
      }
    }))

    const correctionFactor = metadata?.correctionFactor ?? null
    const instrument = metadata?.instrument ?? null

    const geojson = {
      type: 'FeatureCollection' as const,
      properties: {
        session: {
          id: metadata?.id ?? sessionId,
          label: metadata?.label ?? null,
          provincia: metadata?.provincia ?? null,
          localidad: metadata?.localidad ?? null,
          apellido1: metadata?.apellido1 ?? null,
          apellido2: metadata?.apellido2 ?? null,
          startedAt: metadata?.startedAt ? new Date(metadata.startedAt).toISOString() : null,
          stoppedAt: metadata?.stoppedAt ? new Date(metadata.stoppedAt).toISOString() : null,
          sampleCount: metadata?.sampleCount ?? points.length
        },
        instrument: {
          meter: {
            brand: instrument?.meter.brand ?? null,
            model: instrument?.meter.model ?? null,
            serial: instrument?.meter.serial ?? null,
            lastCalibrationDate: instrument?.meter.lastCalibrationDate ?? null
          },
          probe: {
            brand: instrument?.probe.brand ?? null,
            model: instrument?.probe.model ?? null,
            serial: instrument?.probe.serial ?? null
          }
        },
        correctionFactor,
        stats: stats
          ? {
              avgCorrected: stats.avgCorrected,
              maxCorrected: stats.maxCorrected,
              minCorrected: stats.minCorrected,
              pointCount: stats.pointCount
            }
          : null
      },
      features
    }
    return JSON.stringify(geojson, null, 2)
  }
}
