import { EventEmitter } from 'events'
import type { GeoPosition } from '../../shared/GeoTimestamp'
import type { INBMDriver, IGPSDriver } from '../../shared/driver-interfaces'
import { evaluateTrigger, buildGeoTimestamp } from '../geo/fusion/FusionEngine'
import type { FusionConfig } from '../geo/fusion/FusionConfig'
import { DEFAULT_GEO_FUSION } from '../../shared/config.constants'

export type TriggerMode = FusionConfig['triggerMode']
export type GeoFusionConfig = FusionConfig
export const DEFAULT_FUSION_CONFIG: FusionConfig = { ...DEFAULT_GEO_FUSION }

export class GeoFusionService extends EventEmitter {
  private config: FusionConfig
  private sessionId: string = ''
  private nbm: INBMDriver | null = null
  private _gps: IGPSDriver | null = null

  private lastSavedPosition: GeoPosition | null = null
  private timeTimer: NodeJS.Timeout | null = null
  private capturing: boolean = false
  private correctionFactor: number = 1
  private sequenceNumber: number = 0 // incrementa cada captura en una sesión
  private gpsWasLost: boolean = false // true si hubo pérdida de GPS desde la última captura

  constructor(config: FusionConfig = DEFAULT_FUSION_CONFIG) {
    super()
    this.config = config
  }

  // ── Registrar devices ─────────────────────────────────────

  setNBM(driver: INBMDriver): void {
    this.nbm = driver
  }

  setGPS(driver: IGPSDriver): void {
    this._gps = driver
  }

  setCorrectionFactor(factor: number): void {
    this.correctionFactor = factor
  }

  // ── API pública ───────────────────────────────────────────

  start(sessionId: string): void {
    this.sessionId = sessionId
    this.lastSavedPosition = null
    this.capturing = false
    this.sequenceNumber = 0 // reset para nueva sesión
    this.gpsWasLost = false

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
      }
      try {
        this.scheduleNextCapture()
      } catch (err) {
        console.error('[GeoFusionService] Error scheduling next capture:', err)
      }
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
    if (!valid) {
      this.gpsWasLost = true
    }
    if (this.config.triggerMode === 'distance') {
      this.evaluateDistanceTrigger(valid)
    }
  }

  updateConfig(config: Partial<FusionConfig>): void {
    const clean = Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined))
    this.config = { ...this.config, ...clean }
  }

  // ── Trigger logic ─────────────────────────────────────────

  private evaluateDistanceTrigger(valid: boolean): void {
    if (!valid) return
    if (!this.nbm) return
    if (!this._gps) return

    const currentPosition = this._gps.getLastPosition()
    if (!currentPosition) return

    if (evaluateTrigger(currentPosition, this.lastSavedPosition, this.config)) {
      this.capture().catch((err) => {
        console.error('[GeoFusionService] capture error (non-fatal):', err)
      })
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
    if (!this._gps.isPositionValid()) {
      console.warn(`[GeoFusionService] tryCapture(): GPS position not valid`)
      return
    }

    const currentPosition = this._gps.getLastPosition()
    if (!currentPosition) {
      console.warn(`[GeoFusionService] tryCapture(): No position available`)
      return
    }

    if (evaluateTrigger(currentPosition, this.lastSavedPosition, this.config)) {
      console.log(`[GeoFusionService] tryCapture(): About to capture...`)
      await this.capture()
    }
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
        const message = err instanceof Error ? err.message : String(err)
        console.warn(`[GeoFusionService] capture(): resetMaxHold failed (non-fatal): ${message}`)
        // Continuar aunque falle
      }

      if (!sample) {
        console.warn(`[GeoFusionService] capture(): NBM sample is null`)
        return
      }

      this.sequenceNumber++

      const geoTimestamp = buildGeoTimestamp({
        sessionId: this.sessionId,
        sequenceNumber: this.sequenceNumber,
        position,
        sample: { rss: sample.rss, unit: sample.unit },
        correctionFactor: this.correctionFactor,
        gpsWasLost: this.gpsWasLost
      })

      this.gpsWasLost = false

      console.log(
        `[GeoFusionService] capture(): Emitting point [#${this.sequenceNumber}] lat=${position.lat}, lon=${position.lon}, raw=${sample.rss} (factor=${this.correctionFactor}, corrected=${geoTimestamp.correctedMeasurement})`
      )
      this.lastSavedPosition = { ...position }
      this.emit('point', geoTimestamp)
    } finally {
      this.capturing = false
    }
  }
}
