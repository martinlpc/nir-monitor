import type {
  NbmDriverConfig,
  GpsDriverConfig,
  NbmPollingConfig,
  ReconnectConfig,
  SerialProbeConfig,
  FlushConfig,
  GeoFusionConfigOptions,
  NbmDriverTimeouts,
  NbmConnectionType
} from './config.types'

// -- Baud rates (single source of truth) ----------
export const NBM_BAUD_RATE = 460800
export const NBM_OPTICAL_BAUD_RATE = 115200
export const GPS_BAUD_RATE = 4800

export const NBM_BAUD_BY_CONNECTION: Record<NbmConnectionType, number> = {
  usb: NBM_BAUD_RATE,
  optical: NBM_OPTICAL_BAUD_RATE
}

export function nbmBaudRateFor(connectionType: NbmConnectionType): number {
  return NBM_BAUD_BY_CONNECTION[connectionType]
}

// -- Driver configs -------------------------------
export const DEFAULT_NBM_DRIVER: NbmDriverConfig = {
  baudRate: NBM_BAUD_RATE,
  pollIntervalMs: 200,
  unit: 'V/m',
  connectionType: 'usb'
}

export const DEFAULT_GPS_DRIVER: GpsDriverConfig = {
  baudRate: GPS_BAUD_RATE
}

// -- Polling ---------------------------------------
export const DEFAULT_NBM_POLLING: NbmPollingConfig = {
  activePollIntervalMs: 200,
  standbyBatteryIntervalMs: 30_000,
  maxConsecutiveReadFailures: 8
}

// -- Timeouts ---------------------------------------
export const DEFAULT_NBM_TIMEOUTS: NbmDriverTimeouts = {
  responseTimeoutMs: 6000,
  initDelayMs: 2000,
  maxConsecutiveTimeouts: 4
}

// -- Serial probe -----------------------------------
export const DEFAULT_SERIAL_PROBE: SerialProbeConfig = {
  nbmTimeoutMs: 6000,
  nmeaListenMs: 12000
}

// -- Reconnect ---------------------------------------
export const DEFAULT_NBM_RECONNECT: ReconnectConfig = {
  intervalMs: 3000,
  timeoutMs: 30_000
}

export const DEFAULT_GPS_RECONNECT: ReconnectConfig = {
  intervalMs: 3000,
  timeoutMs: 30_000
}

// -- DB flush ---------------------------------------
// Cada punto se guarda al instante en el journal (src/main/db/PointJournal.ts).
// Estos valores solo regulan cada cuánto se vuelca la base completa a disco.
export const DEFAULT_FLUSH: FlushConfig = {
  everyNPoints: 25,
  intervalMs: 30_000
}

// -- Session limits -----------------------------------
/** Tope de puntos por sesión de medición. Al alcanzarlo la sesión se detiene sola. */
export const MAX_SESSION_POINTS = 5000

// -- Geo fusion ---------------------------------------
export const DEFAULT_GEO_FUSION: GeoFusionConfigOptions = {
  triggerMode: 'distance',
  minDistanceMeters: 20,
  intervalMs: 5000,
  testMode: false
}
