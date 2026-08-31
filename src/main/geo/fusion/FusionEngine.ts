import { v4 as uuidv4 } from 'uuid'
import { haversineMeters } from '../../../shared/geo-utils'
import type { GeoPosition, GeoTimestamp, EMFSample } from '../../../shared/GeoTimestamp'
import type { FusionConfig } from '../../../shared/FusionConfig'

export interface RawSample {
  rss: number
  unit: string
}

export interface BuildPointParams {
  sessionId: string
  sequenceNumber: number
  position: GeoPosition
  sample: RawSample
  correctionFactor: number
  gpsWasLost: boolean
}

export function evaluateTrigger(
  currentPosition: GeoPosition | null,
  lastSavedPosition: GeoPosition | null,
  config: Pick<FusionConfig, 'minDistanceMeters' | 'testMode'>
): boolean {
  if (!currentPosition) return false
  if (config.testMode) return true
  if (!lastSavedPosition) return true
  return haversineMeters(lastSavedPosition, currentPosition) >= config.minDistanceMeters
}

export function buildGeoTimestamp(params: BuildPointParams): GeoTimestamp {
  const correctedMeasurement = params.sample.rss * params.correctionFactor
  const gpsGap = params.gpsWasLost || undefined

  return {
    id: uuidv4(),
    sessionId: params.sessionId,
    sequenceNumber: params.sequenceNumber,
    timestamp: params.position.nmeaUtcMs ?? Date.now(),
    position: { ...params.position },
    emf: {
      deviceId: 'nbm550',
      rawMeasurement: params.sample.rss,
      unit: params.sample.unit as EMFSample['unit']
    },
    correctedMeasurement,
    gpsGap
  }
}
