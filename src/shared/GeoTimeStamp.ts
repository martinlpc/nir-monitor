export interface GeoPosition {
  lat: number
  lon: number
  alt: number // metros sobre el nivel del mar
  hdop: number // precisión horizontal GPS
}

export interface EMFSample {
  deviceId: string // 'nbm500' | 'future-device-x'
  x: number // µT o V/m según el dispositivo
  y: number
  z: number
  total: number // magnitud resultante
  unit: 'µT' | 'V/m' | 'mA/m'
}

export interface GeoTimestamp {
  id: string // uuid v4
  sessionId: string
  timestamp: number // Unix ms — fuente de verdad para fusión
  position: GeoPosition
  emf: EMFSample
  interpolated: boolean // true si la posición fue interpolada
}
