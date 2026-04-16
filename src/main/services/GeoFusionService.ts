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
  testMode?: boolean
}

export const DEFAULT_FUSION_CONFIG: GeoFusionConfig = {
  triggerMode: 'distance',
  minDistanceMeters: 10,
  intervalMs: 5000,
  testMode: false
}

export class GeoFusionService extends EventEmitter {
  private config: GeoFusionConfig
  private sessionId: string = ''
  private nbm: NBM550Driver | null = null
  private _gps: GPSDriver | null = null

  private lastSavedPosition: GeoPosition | null = null
  private timeTimer: NodeJS.Timeout | null = null
  private capturing: boolean = false
  private uncertaintyFactor: number = 1
  private sequenceNumber: number = 0 // incrementa cada captura en una sesión

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

  setUncertaintyFactor(factor: number): void {
    this.uncertaintyFactor = factor
  }

  // ── API pública ───────────────────────────────────────────

  start(sessionId: string): void {
    this.sessionId = sessionId
    this.lastSavedPosition = null
    this.capturing = false
    this.sequenceNumber = 0 // reset para nueva sesión

    console.log(`[GeoFusionService] start() called with sessionId: ${sessionId}`)
    console.log(
      `[GeoFusionService] current config triggerMode: ${this.config.triggerMode}, intervalMs: ${this.config.intervalMs}`
    )

    if (this.config.triggerMode === 'time') {
      console.log(
        `[GeoFusionService] Starting time-based trigger every ${this.config.intervalMs}ms`
      )
      this.scheduleNextCapture()
    } else {
      console.log(`[GeoFusionService] Using distance-based trigger`)
    }
    // modo distancia: trigger via onGPSPosition() - no necesita setup
  }

  private scheduleNextCapture(): void {
    if (!this.sessionId) return
    this.timeTimer = setTimeout(async () => {
      try {
        await this.tryCapture()
      } catch (err) {
        console.error('[GeoFusionService] Error in tryCapture:', err)
        // Continuar sin importar el error
      }
      this.scheduleNextCapture()
    }, this.config.intervalMs)
  }

  stop(): void {
    if (this.timeTimer) {
      clearTimeout(this.timeTimer)
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

    // En modo test, tomar cada punto sin umbral de distancia
    if (this.config.testMode) {
      this.capture()
      return
    }

    if (!this.lastSavedPosition) {
      this.capture()
      return
    }

    const dist = haversineMeters(this.lastSavedPosition, currentPosition)
    if (dist >= this.config.minDistanceMeters) {
      this.capture()
    }
  }

  private async tryCapture(): Promise<void> {
    if (!this.nbm) {
      console.warn(`[GeoFusionService] tryCapture(): NBM not available`)
      return
    }
    if (!this._gps) {
      console.warn(`[GeoFusionService] tryCapture(): GPS not available`)
      return
    }
    if (!this._gps.isPositionValid) {
      console.warn(`[GeoFusionService] tryCapture(): GPS position not valid`)
      return
    }

    console.log(`[GeoFusionService] tryCapture(): About to capture...`)
    await this.capture()
  }

  // ── Captura ───────────────────────────────────────────────

  private async capture(): Promise<void> {
    if (this.capturing) {
      console.log(`[GeoFusionService] capture(): Already capturing, skipping`)
      return
    }
    this.capturing = true
    console.log(`[GeoFusionService] capture(): Starting...`)

    try {
      if (!this._gps || !this.nbm) {
        console.warn(`[GeoFusionService] capture(): Missing GPS or NBM`)
        return
      }

      // Lee posición y validez en el instante exacto del trigger
      const position = this._gps.getLastPosition()
      const valid = this._gps.isPositionValid()
      if (!position || !valid) {
        console.warn(`[GeoFusionService] capture(): No valid position available`)
        return
      }

      const sample = await this.nbm.readMeasurement()

      // Intentar resetear max hold sin bloquear la captura
      try {
        await this.nbm.resetMaxHold()
      } catch (err) {
        console.warn(`[GeoFusionService] capture(): resetMaxHold failed (non-fatal):`, err)
        // Continuar aunque falle
      }

      if (!sample) {
        console.warn(`[GeoFusionService] capture(): NBM sample is null`)
        return
      }

      this.sequenceNumber++
      const rssWithUncertainty = sample.rss * this.uncertaintyFactor

      const geoTimestamp: GeoTimestamp = {
        id: uuidv4(),
        sessionId: this.sessionId,
        sequenceNumber: this.sequenceNumber,
        timestamp: Date.now(),
        position: { ...position },
        emf: {
          deviceId: 'nbm550',
          rss: sample.rss,
          unit: sample.unit as EMFSample['unit']
        },
        rssWithUncertainty
      }

      console.log(
        `[GeoFusionService] capture(): Emitting point [#${this.sequenceNumber}] lat=${position.lat}, lon=${position.lon}, rss=${sample.rss} (factor=${this.uncertaintyFactor}, adjusted=${rssWithUncertainty})`
      )
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
