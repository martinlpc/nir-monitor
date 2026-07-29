import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import type { GeoTimestamp, GeoPosition, EMFSample } from '../../shared/GeoTimestamp'
import type { INBMDriver, IGPSDriver } from '../../shared/driver-interfaces'
import { DEFAULT_GEO_FUSION } from '../../shared/config.constants'
import { haversineMeters } from '../../shared/geo-utils'

export type TriggerMode = 'distance' | 'time'

export interface GeoFusionConfig {
  triggerMode: TriggerMode
  minDistanceMeters: number
  intervalMs: number
  testMode?: boolean
}

export const DEFAULT_FUSION_CONFIG: GeoFusionConfig = { ...DEFAULT_GEO_FUSION }

export class GeoFusionService extends EventEmitter {
  private config: GeoFusionConfig
  private sessionId: string = ''
  private nbm: INBMDriver | null = null
  private _gps: IGPSDriver | null = null

  private lastSavedPosition: GeoPosition | null = null
  private timeTimer: NodeJS.Timeout | null = null
  private capturing: boolean = false
  private correctionFactor: number = 1
  private sequenceNumber: number = 0 // incrementa cada captura en una sesión
  private gpsWasLost: boolean = false // true si hubo pérdida de GPS desde la última captura

  constructor(config: GeoFusionConfig = DEFAULT_FUSION_CONFIG) {
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

  updateConfig(config: Partial<GeoFusionConfig>): void {
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

    // En modo test, tomar cada punto sin umbral de distancia
    if (this.config.testMode) {
      console.log('[GeoFusionService] evaluateDistanceTrigger: test mode — capturing')
      this.capture().catch((err) => {
        console.error('[GeoFusionService] capture error (non-fatal):', err)
      })
      return
    }

    if (!this.lastSavedPosition) {
      console.log('[GeoFusionService] evaluateDistanceTrigger: first position — capturing')
      this.capture().catch((err) => {
        console.error('[GeoFusionService] capture error (non-fatal):', err)
      })
      return
    }

    const dist = haversineMeters(this.lastSavedPosition, currentPosition)
    if (dist >= this.config.minDistanceMeters) {
      console.log(
        `[GeoFusionService] evaluateDistanceTrigger: distance ${dist.toFixed(1)}m >= ${this.config.minDistanceMeters}m — capturing`
      )
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

    // Siempre respetar el umbral de distancia para no duplicar puntos
    if (this.config.testMode) {
      await this.capture()
      return
    }

    if (this.lastSavedPosition) {
      const dist = haversineMeters(this.lastSavedPosition, currentPosition)
      if (dist < this.config.minDistanceMeters) {
        console.log(
          `[GeoFusionService] tryCapture(): Skipping — only ${dist.toFixed(1)}m moved (< ${this.config.minDistanceMeters}m)`
        )
        return
      }
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
        const message = err instanceof Error ? err.message : String(err)
        console.warn(`[GeoFusionService] capture(): resetMaxHold failed (non-fatal): ${message}`)
        // Continuar aunque falle
      }

      if (!sample) {
        console.warn(`[GeoFusionService] capture(): NBM sample is null`)
        return
      }

      this.sequenceNumber++
      const correctedMeasurement = sample.rss * this.correctionFactor

      const gpsGap = this.gpsWasLost || undefined
      this.gpsWasLost = false

      const geoTimestamp: GeoTimestamp = {
        id: uuidv4(),
        sessionId: this.sessionId,
        sequenceNumber: this.sequenceNumber,
        timestamp: position.nmeaUtcMs ?? Date.now(),
        position: { ...position },
        emf: {
          deviceId: 'nbm550',
          rawMeasurement: sample.rss,
          unit: sample.unit as EMFSample['unit']
        },
        correctedMeasurement,
        gpsGap
      }

      console.log(
        `[GeoFusionService] capture(): Emitting point [#${this.sequenceNumber}] lat=${position.lat}, lon=${position.lon}, raw=${sample.rss} (factor=${this.correctionFactor}, corrected=${correctedMeasurement})`
      )
      this.lastSavedPosition = { ...position }
      this.emit('point', geoTimestamp)
    } finally {
      this.capturing = false
    }
  }
}
