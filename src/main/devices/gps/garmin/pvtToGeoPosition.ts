import type { GeoPosition } from '../../../../shared/GeoTimestamp'
import type { GPSState } from '../gps.types'
import { GPS_EPOCH_SECONDS, RAD_TO_DEG, type GarminPVT } from './GarminUSBProtocol'

const KNOTS_KMH = 3.6
const SECONDS_PER_DAY = 86400

export function fixToFixType(fix: number): GPSState['fixType'] {
  if (fix === 2 || fix === 4) return '2d'
  if (fix === 3 || fix === 5) return '3d'
  return 'none'
}

export function pvtUtcMs(pvt: GarminPVT): number {
  return Math.round(
    (GPS_EPOCH_SECONDS + pvt.grmnDays * SECONDS_PER_DAY + Math.round(pvt.gpsTow) - pvt.leapSec) *
      1000
  )
}

export function pvtSpeedKmh(pvt: GarminPVT): number {
  return KNOTS_KMH * Math.hypot(pvt.eastVel, pvt.northVel)
}

export function pvtHeadingDeg(pvt: GarminPVT): number {
  return (Math.atan2(pvt.eastVel, pvt.northVel) * RAD_TO_DEG + 360) % 360
}

export function garminPVTToGeoPosition(pvt: GarminPVT): GeoPosition | null {
  if (fixToFixType(pvt.fix) === 'none') return null
  const speed = pvtSpeedKmh(pvt)
  return {
    lat: pvt.latRad * RAD_TO_DEG,
    lon: pvt.lonRad * RAD_TO_DEG,
    alt: pvt.alt + pvt.mslHght,
    heading: pvtHeadingDeg(pvt),
    speed: speed > 0 ? speed : undefined,
    nmeaUtcMs: pvtUtcMs(pvt)
  }
}
