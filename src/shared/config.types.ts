export interface NbmDriverConfig {
  baudRate: number
  pollIntervalMs: number
  unit: string
}

export interface GpsDriverConfig {
  baudRate: number
}

export interface NbmPollingConfig {
  activePollIntervalMs: number
  standbyBatteryIntervalMs: number
  maxConsecutiveReadFailures: number
}

export interface NbmDriverTimeouts {
  responseTimeoutMs: number
  initDelayMs: number
  maxConsecutiveTimeouts: number
}

export interface ReconnectConfig {
  intervalMs: number
  timeoutMs: number
}

export interface SerialProbeConfig {
  nbmTimeoutMs: number
  nmeaListenMs: number
}

export interface FlushConfig {
  everyNPoints: number
  intervalMs: number
}

export interface GeoFusionConfigOptions {
  triggerMode: 'distance' | 'time'
  minDistanceMeters: number
  intervalMs: number
  testMode: boolean
}

export interface UserAppConfig {
  ports?: { nbm550?: string; gps?: string }
  triggerMode?: 'distance' | 'time'
  intervalMs?: number
  minDistanceMeters?: number
}
