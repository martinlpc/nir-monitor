export type TriggerMode = 'distance' | 'time'

export interface FusionConfig {
  triggerMode: TriggerMode
  minDistanceMeters: number
  intervalMs: number
  testMode?: boolean
}
