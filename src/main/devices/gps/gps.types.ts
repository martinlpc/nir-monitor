import type { GeoPosition } from '../../../shared/GeoTimestamp'

export interface GPSState {
  position: GeoPosition | null
  valid: boolean
  fixType: 'none' | '2d' | '3d'
  satelliteCount: number
  speed: number // km/h
  heading: number // grados 0-360
  lastUpdateAt: number // ms
  nmeaTimestamp: number | null // Unix ms desde UTC NMEA (RMC), o null si no disponible
}

export const INITIAL_GPS_STATE: GPSState = {
  position: null,
  valid: false,
  fixType: 'none',
  satelliteCount: 0,
  speed: 0,
  heading: 0,
  lastUpdateAt: 0,
  nmeaTimestamp: null
}
