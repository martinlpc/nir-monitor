export interface GeoPosition {
  lat: number
  lon: number
  alt: number // metros sobre el nivel del mar
  hdop?: number
  nmeaUtcMs?: number // Unix ms desde UTC NMEA (RMC), o undefined si no disponible
}

export interface EMFSample {
  deviceId: string // 'nbm500' | 'future-device-x'
  rawMeasurement: number // valor medido original sin correcciones
  unit: 'V/m' | 'A/m' | 'mW/cm^2' | 'W/m^2'
}

export interface GeoTimestamp {
  id: string // uuid v4
  sessionId: string
  sequenceNumber: number // 1, 2, 3... orden de captura en la sesión
  timestamp: number // Unix ms — fuente de verdad para fusión
  position: GeoPosition
  emf: EMFSample
  correctedMeasurement: number // rawMeasurement × correctionFactor de la sesión
  gpsGap?: boolean // true si este punto se capturó después de una pérdida de señal GPS
}
