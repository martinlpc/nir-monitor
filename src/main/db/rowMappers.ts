import type { GeoTimestamp, EMFSample } from '../../shared/GeoTimestamp'
import type { SessionSummary } from '../../shared/ipc.types'
import type { SessionStats } from '../../shared/services/ISessionRepository'

/**
 * Convierte una fila de sql.js (array de valores) + sus nombres de columna
 * en un objeto clave/valor tipado como Record<string, unknown>.
 */
export function rowToObject(row: unknown[], columns: string[]): Record<string, unknown> {
  return Object.fromEntries(columns.map((col, idx) => [col, row[idx]]))
}

/**
 * Convertir Unix timestamp (ms) a formato ISO 8601 legible
 */
export function unixToISO(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

/**
 * Convertir ISO 8601 a Unix timestamp (ms)
 */
export function isoToUnix(isoString: string): number {
  return new Date(isoString).getTime()
}

/**
 * Mapear una fila de geo_points a GeoTimestamp
 */
export function rowToGeoTimestamp(row: unknown[], columns: string[]): GeoTimestamp {
  const rowMap = rowToObject(row, columns)
  return {
    id: rowMap.id as string,
    sessionId: rowMap.sessionId as string,
    sequenceNumber: rowMap.sequenceNumber as number,
    timestamp: isoToUnix(rowMap.timestamp as string),
    position: {
      lat: rowMap.lat as number,
      lon: rowMap.lon as number,
      alt: (rowMap.alt as number) || 0
    },
    emf: {
      deviceId: 'nbm550',
      rawMeasurement: rowMap.rawMeasurement as number,
      unit: rowMap.unit as EMFSample['unit']
    },
    correctedMeasurement: rowMap.correctedMeasurement as number,
    gpsGap: (rowMap.gps_gap as number) === 1 || undefined
  }
}

/**
 * Mapear una fila de `sessions` a SessionSummary
 */
export function rowToSessionSummary(row: unknown[], columns: string[]): SessionSummary {
  const rowMap = rowToObject(row, columns)
  return {
    id: rowMap.id as string,
    label: rowMap.label as string,
    startedAt: isoToUnix(rowMap.startedAt as string),
    stoppedAt: rowMap.stoppedAt ? isoToUnix(rowMap.stoppedAt as string) : null,
    sampleCount: rowMap.sampleCount as number,
    instrument: rowMap.instrument ? JSON.parse(rowMap.instrument as string) : null,
    correctionFactor: rowMap.correctionFactor != null ? Number(rowMap.correctionFactor) : null,
    provincia: rowMap.provincia as string | undefined,
    localidad: rowMap.localidad as string | undefined,
    apellido1: rowMap.apellido1 as string | undefined,
    apellido2: rowMap.apellido2 as string | undefined
  }
}

/**
 * Mapear una fila de `session_stats` a SessionStats
 */
export function rowToSessionStats(row: unknown[], columns: string[]): SessionStats {
  const rowMap = rowToObject(row, columns)
  return {
    avgCorrected: rowMap.avgCorrected as number,
    maxCorrected: rowMap.maxCorrected as number,
    minCorrected: rowMap.minCorrected as number,
    pointCount: rowMap.pointCount as number
  }
}
