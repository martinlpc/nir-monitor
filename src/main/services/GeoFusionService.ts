import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import type { GeoTimestamp, GeoPosition, EMFSample } from '../../shared/GeoTimestamp'
import type { NBM550Driver } from '../devices/nbm550/NBM550Driver'
import type { GPSDriver } from '../devices/gps/GPSDriver'

export type TriggerMode = 'distance' | 'time'

export interface GeoFusionConfig {
  triggerMode: TriggerMode
  minDistanceMeters: number
  intervalMs: number
}

export const DEFAULT_FUSION_CONFIG: GeoFusionConfig = {
  triggerMode: 'distance',
  minDistanceMeters: 10,
  intervalMs: 5000
}

export class GeoFusionService extends EventEmitter {
  private config: GeoFusionConfig
  private sessionId: string = ''
  private nbm: NBM550Driver | null = null
  private _gps: GPSDriver | null = null

  private lastSavedPosition: GeoPosition | null = null
  private timeTimer: NodeJS.Timeout | null = null
  private capturing: boolean = false

  constructor(config: GeoFusionConfig = DEFAULT_FUSION_CONFIG) {
    super()
    this.config = config
  }

  // ── Registrar devices ─────────────────────────────────────

  setNBM(driver: NBM550Driver): void {
    this.nbm = driver
  }

  setGPS(driver: GPSDriver): void {
    this._gps = driver
  }

  // ── API pública ───────────────────────────────────────────

  start(sessionId: string): void {
    this.sessionId = sessionId
    this.lastSavedPosition = null
    this.capturing = false

    if (this.config.triggerMode === 'time') {
      this.timeTimer = setInterval(() => this.tryCapture(), this.config.intervalMs)
    }
    // modo distancia: trigger via onGPSPosition() - no necesita setup
  }

  stop(): void {
    if (this.timeTimer) {
      clearInterval(this.timeTimer)
      this.timeTimer = null
    }
  }

  // Llamado por SessionService en cada trama GPS
  // Solo evalúa el trigger — la posición se lee desde el driver en capture()
  onGPSPosition(valid: boolean): void {
    if (this.config.triggerMode === 'distance') {
      this.evaluateDistanceTrigger(valid)
    }
  }

  updateConfig(config: Partial<GeoFusionConfig>): void {
    this.config = { ...this.config, ...config }
  }

  // ── Trigger logic ─────────────────────────────────────────

  private evaluateDistanceTrigger(valid: boolean): void {
    if (!valid) return
    if (!this.nbm) return
    if (!this._gps) return

    const currentPosition = this._gps.getLastPosition()
    if (!currentPosition) return

    if (!this.lastSavedPosition) {
      this.capture()
      return
    }

    const dist = haversineMeters(this.lastSavedPosition, currentPosition)
    if (dist >= this.config.minDistanceMeters) {
      this.capture()
    }
  }

  private tryCapture(): void {
    if (!this.nbm) return
    if (!this._gps) return
    if (!this._gps.isPositionValid) return

    this.capture()
  }

  // ── Captura ───────────────────────────────────────────────

  private async capture(): Promise<void> {
    if (this.capturing) return
    this.capturing = true

    try {
      if (!this._gps || !this.nbm) return

      // Lee posición y validez en el instante exacto del trigger
      const position = this._gps.getLastPosition()
      const valid = this._gps.isPositionValid()
      if (!position || !valid) return

      const sample = await this.nbm.readMeasurement()
      await this.nbm.resetMaxHold()

      if (!sample) return

      const geoTimestamp: GeoTimestamp = {
        id: uuidv4(),
        sessionId: this.sessionId,
        timestamp: Date.now(),
        position: { ...position },
        emf: {
          deviceId: 'nbm550',
          rss: sample.rss,
          unit: sample.unit as EMFSample['unit']
        },
        interpolated: false
      }

      this.lastSavedPosition = { ...position }
      this.emit('point', geoTimestamp)
    } finally {
      this.capturing = false
    }
  }
}

// ── Haversine ─────────────────────────────────────────────────

function haversineMeters(a: GeoPosition, b: GeoPosition): number {
  const R = 6_371_000
  const toRad = (deg: number): number => (deg * Math.PI) / 180

  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)

  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)

  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon

  return 2 * R * Math.asin(Math.sqrt(h))
}
