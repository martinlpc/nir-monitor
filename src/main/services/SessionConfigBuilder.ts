import type { UserAppConfig } from '../../shared/config.types'
import type { FusionConfig } from '../geo/fusion/FusionConfig'

export interface SessionConfigInput {
  triggerMode?: 'distance' | 'time'
  minDistanceMeters?: number
  intervalMs?: number
  testMode?: boolean
}

export function buildFusionConfig(
  appConfig: Partial<UserAppConfig>,
  overrides?: SessionConfigInput
): Partial<FusionConfig> | undefined {
  const merged: Partial<FusionConfig> = {}

  if (appConfig.triggerMode) merged.triggerMode = appConfig.triggerMode
  if (appConfig.intervalMs != null) merged.intervalMs = appConfig.intervalMs
  if (appConfig.minDistanceMeters != null) merged.minDistanceMeters = appConfig.minDistanceMeters

  if (overrides) {
    if (overrides.triggerMode !== undefined) merged.triggerMode = overrides.triggerMode
    if (overrides.intervalMs !== undefined) merged.intervalMs = overrides.intervalMs
    if (overrides.minDistanceMeters !== undefined)
      merged.minDistanceMeters = overrides.minDistanceMeters
    if (overrides.testMode !== undefined) merged.testMode = overrides.testMode
  }

  const result = Object.keys(merged).length > 0 ? merged : undefined

  if (result?.testMode) {
    result.triggerMode = 'time'
    result.intervalMs = result.intervalMs || 5000
  }

  return result
}
