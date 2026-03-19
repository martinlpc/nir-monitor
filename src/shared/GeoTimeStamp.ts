export interface GeoPosition {
  lat: number
  lon: number
  alt: number // metros sobre el nivel del mar
  hdop: number // precisión horizontal GPS
}

export interface EMFSample {
  deviceId: string // 'nbm500' | 'future-device-x'
  rss: number
  unit: 'V/m' | 'A/m' | 'mW/cm^2' | 'W/m^2'
}

export interface GeoTimestamp {
  id: string // uuid v4
  sessionId: string
  timestamp: number // Unix ms — fuente de verdad para fusión
  position: GeoPosition
  emf: EMFSample
  interpolated: boolean // true si la posición fue interpolada
}
