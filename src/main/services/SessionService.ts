import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { GeoFusionService, type GeoFusionConfig } from './GeoFusionService'
import type { GeoTimestamp, GeoPosition } from '../../shared/GeoTimestamp'
import type { NBM550Driver } from '../devices/nbm550/NBM550Driver'
import type { GPSDriver } from '../devices/gps/GPSDriver'
import type { SimulatedNBM550Driver } from '../devices/simulated/SimulatedNBM550Driver'
import type { SimulatedGPSDriver } from '../devices/simulated/SimulatedGPSDriver'
import type { SessionSummary, InstrumentInfo } from '../../shared/ipc.types'
import type { ISessionRepository } from '../../shared/services/ISessionRepository'
import { loadAppConfig } from './AppConfig'
import { resolveBuiltInFactor } from '../uncertainty/correctionFactor'
import { AppError } from '../../shared/errors/AppError'

export type SessionState = 'idle' | 'running' | 'stopped'

export class SessionService extends EventEmitter {
  private state: SessionState = 'idle'
  private currentSessionId: string | null = null
  private startedAt: number = 0
  private pointCount: number = 0
  private label: string = ''
  private accumulatedPoints: GeoTimestamp[] = []

  private fusion: GeoFusionService
  private nbm: NBM550Driver | SimulatedNBM550Driver | null = null
  private gps: GPSDriver | SimulatedGPSDriver | null = null
  private repository: ISessionRepository | null = null
  private instrument: InstrumentInfo | null = null
  private correctionFactor: number | null = null
  private provincia: string = ''
  private localidad: string = ''
  private apellido1: string = ''
  private apellido2: string = ''

  private resolveCorrectionFactor(probeModel: string | null): number | null {
    if (!probeModel) return null
    return resolveBuiltInFactor(probeModel)
  }

  private syncCorrectionFactorFromProbe(probeModel: string | null): void {
    const resolved = this.resolveCorrectionFactor(probeModel)
    this.correctionFactor = resolved
    this.fusion.setCorrectionFactor(resolved ?? 1)
    console.log(
      `[SessionService] Correction factor sync -> probe=${probeModel ?? 'N/A'}, factor=${resolved ?? 1}`
    )
  }

  constructor(fusion: GeoFusionService, repository?: ISessionRepository) {
    super()
    this.fusion = fusion
    this.repository = repository || null

    this.fusion.on('point', (point: GeoTimestamp) => {
      this.pointCount++
      this.accumulatedPoints.push(point)
      console.log(
        `[SessionService] Point captured! Count: ${this.pointCount}, timestamp: ${point.timestamp}`
      )
      this.emit('point', point)

      // Guardar incrementalmente en la BD de forma asincrónica (no bloquea)
      if (this.state === 'running' && this.repository && this.currentSessionId) {
        this.repository.addPoint(this.currentSessionId, point).catch((err) => {
          console.error('[SessionService] Failed to save point:', err)
        })
      }
    })
  }

  // ── Registro de devices ───────────────────────────────────

  setNBM(driver: NBM550Driver | SimulatedNBM550Driver): void {
    this.nbm = driver
    this.fusion.setNBM(driver)
    const probeModel = driver.getProbeInfo()?.model ?? null
    this.syncCorrectionFactorFromProbe(probeModel)
    if (this.state === 'running' && probeModel && this.correctionFactor == null) {
      const message = `No se encontró factor de corrección para la sonda "${probeModel}". La sesión se detuvo por seguridad.`
      console.error(`[SessionService] ${message}`)
      this.emit('alert', { message })
      void this.stop().catch((err) => {
        console.error(
          '[SessionService] Error stopping session after missing correction factor:',
          err
        )
      })
    }
  }

  setGPS(driver: GPSDriver | SimulatedGPSDriver): void {
    this.gps = driver
    this.fusion.setGPS(driver)

    driver.on('position', (coords: GeoPosition, valid: boolean) => {
      this.emit('position', coords, valid)

      if (this.state === 'running') {
        this.fusion.onGPSPosition(valid)
      }
    })
  }

  // ── Ciclo de sesión ───────────────────────────────────────

  async start(
    label: string = '',
    fusionConfig?: Partial<GeoFusionConfig>,
    locationData?: {
      provincia?: string
      localidad?: string
      apellido1?: string
      apellido2?: string
    }
  ): Promise<string> {
    if (this.state === 'running') {
      throw new AppError({
        code: 'SESSION_ALREADY_RUNNING',
        message: 'Ya hay una sesión en curso',
        severity: 'warning',
        category: 'session',
        userAction: 'Detenga la sesión actual antes de iniciar una nueva',
        retryable: true
      })
    }
    if (!this.nbm?.isConnected()) {
      throw new AppError({
        code: 'SESSION_NBM_NOT_CONNECTED',
        message: 'NBM-550 no conectado',
        severity: 'error',
        category: 'session',
        userAction: 'Conecte el NBM-550 en el panel de dispositivos antes de iniciar la sesión',
        retryable: true
      })
    }
    if (!this.gps?.isConnected()) {
      throw new AppError({
        code: 'SESSION_GPS_NOT_CONNECTED',
        message: 'GPS no conectado',
        severity: 'error',
        category: 'session',
        userAction: 'Conecte el GPS en el panel de dispositivos antes de iniciar la sesión',
        retryable: true
      })
    }
    if (!this.gps.isPositionValid()) {
      throw new AppError({
        code: 'SESSION_GPS_NO_FIX',
        message: 'GPS sin fix: espere a obtener señal antes de iniciar la sesión',
        severity: 'warning',
        category: 'session',
        userAction: 'Despeje la vista al cielo y espere a que el GPS obtenga señal',
        retryable: true
      })
    }

    this.currentSessionId = uuidv4()
    this.startedAt = Date.now()
    this.pointCount = 0
    this.label = label || `Recorrido ${new Date().toLocaleDateString('es-AR')}`
    this.accumulatedPoints = []
    this.correctionFactor = null
    this.provincia = locationData?.provincia || ''
    this.localidad = locationData?.localidad || ''
    this.apellido1 = locationData?.apellido1 || ''
    this.apellido2 = locationData?.apellido2 || ''

    console.log(`[SessionService] Starting session: ${this.currentSessionId}, label: ${this.label}`)
    console.log(`[SessionService] fusionConfig:`, fusionConfig)

    const appConfig = loadAppConfig()
    const merged: Partial<GeoFusionConfig> = {}

    if (appConfig.triggerMode) merged.triggerMode = appConfig.triggerMode
    if (appConfig.intervalMs != null) merged.intervalMs = appConfig.intervalMs
    if (appConfig.minDistanceMeters != null) merged.minDistanceMeters = appConfig.minDistanceMeters

    if (fusionConfig) {
      if (fusionConfig.triggerMode !== undefined) merged.triggerMode = fusionConfig.triggerMode
      if (fusionConfig.intervalMs !== undefined) merged.intervalMs = fusionConfig.intervalMs
      if (fusionConfig.minDistanceMeters !== undefined)
        merged.minDistanceMeters = fusionConfig.minDistanceMeters
      if (fusionConfig.testMode !== undefined) merged.testMode = fusionConfig.testMode
    }

    fusionConfig = Object.keys(merged).length > 0 ? merged : undefined

    // En modo test, convertir a captura por tiempo
    if (fusionConfig?.testMode) {
      console.log(
        `[SessionService] testMode detected - converting to time-based trigger (5s intervals)`
      )
      fusionConfig = {
        ...fusionConfig,
        triggerMode: 'time',
        intervalMs: fusionConfig.intervalMs || 5000
      }
    }

    console.log(`[SessionService] final fusionConfig:`, fusionConfig)
    if (fusionConfig) this.fusion.updateConfig(fusionConfig)

    console.log(`[SessionService] Resetting NBM max hold...`)
    try {
      await this.nbm.resetMaxHold()
    } catch (err) {
      // Error 100 en RESET_MAX es normal en algunos casos - continuar sin bloquear
      console.warn(`[SessionService] Warning: resetMaxHold failed (this may be normal):`, err)
    }

    // Inicializar sesión en el repositorio antes de empezar a capturar
    if (this.repository) {
      const probeInfo = this.nbm.getProbeInfo()

      this.instrument = {
        meter: {
          brand: 'Narda',
          model: 'NBM-550',
          serial: this.nbm.getMeterSerial() ?? null,
          lastCalibrationDate: null
        },
        probe: {
          brand: 'Narda',
          model: probeInfo?.model ?? null,
          serial: probeInfo?.serial ?? null,
          calibrationDate: probeInfo?.calibrationDate ?? null
        }
      }
      this.syncCorrectionFactorFromProbe(this.instrument.probe.model)
      if (this.correctionFactor == null) {
        const probeModel = this.instrument.probe.model ?? 'desconocida'
        const appError = new AppError({
          code: 'SESSION_NO_CORRECTION_FACTOR',
          message: `No se encontró factor de corrección para la sonda "${probeModel}"`,
          severity: 'error',
          category: 'correction',
          userAction:
            'Revise la configuración de incertidumbre en Ajustes. Asegúrese de que la sonda esté en la tabla de factores de corrección',
          retryable: true
        })
        throw appError
      }

      try {
        await this.repository.initSession(this.currentSessionId, {
          id: this.currentSessionId,
          label: this.label,
          startedAt: this.startedAt,
          stoppedAt: null,
          sampleCount: 0,
          instrument: this.instrument,
          correctionFactor: this.correctionFactor,
          provincia: this.provincia || undefined,
          localidad: this.localidad || undefined,
          apellido1: this.apellido1 || undefined,
          apellido2: this.apellido2 || undefined
        })
      } catch (err) {
        console.error('[SessionService] Failed to init session in repository:', err)
      }
    } else {
      this.syncCorrectionFactorFromProbe(null)
    }

    console.log(`[SessionService] Calling fusion.start()...`)
    this.fusion.start(this.currentSessionId)
    this.state = 'running'

    console.log(`[SessionService] Session started successfully, state: running`)
    this.emit('started', {
      sessionId: this.currentSessionId,
      startedAt: this.startedAt,
      label: this.label,
      correctionFactor: this.correctionFactor,
      instrument: this.instrument
    })

    return this.currentSessionId
  }

  async stop(): Promise<SessionSummary> {
    if (this.state !== 'running') {
      throw new AppError({
        code: 'SESSION_NOT_RUNNING',
        message: 'No hay sesión en curso',
        severity: 'warning',
        category: 'session',
        userAction: 'Inicie una sesión antes de intentar detenerla'
      })
    }

    console.log(`[SessionService] Stopping session, total points: ${this.pointCount}`)
    this.fusion.stop()
    this.state = 'stopped'

    const summary: SessionSummary = {
      id: this.currentSessionId!,
      label: this.label,
      startedAt: this.startedAt,
      stoppedAt: Date.now(),
      sampleCount: this.pointCount,
      instrument: this.instrument,
      correctionFactor: this.correctionFactor,
      provincia: this.provincia || undefined,
      localidad: this.localidad || undefined,
      apellido1: this.apellido1 || undefined,
      apellido2: this.apellido2 || undefined
    }

    // Finalizar sesión en el repositorio (actualizar metadatos + computar stats + flush a disco)
    if (this.repository && this.currentSessionId) {
      try {
        console.log(
          `[SessionService] Finalizing session with ${this.accumulatedPoints.length} points...`
        )
        await this.repository.finalizeSession(this.currentSessionId, summary)
        console.log(`[SessionService] Session ${this.currentSessionId} finalized successfully`)
      } catch (err) {
        console.error(`[SessionService] Failed to finalize session: ${err}`)
        // No throw - sesión termina pero sin persistencia
      }
    }

    this.emit('stopped', summary)
    return summary
  }

  // ── Estado ────────────────────────────────────────────────

  getState(): SessionState {
    return this.state
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId
  }

  getSummary(): SessionSummary | null {
    if (!this.currentSessionId) return null

    return {
      id: this.currentSessionId,
      label: this.label,
      startedAt: this.startedAt,
      stoppedAt: this.state === 'stopped' ? Date.now() : null,
      sampleCount: this.pointCount,
      instrument: this.instrument,
      correctionFactor: this.correctionFactor,
      provincia: this.provincia || undefined,
      localidad: this.localidad || undefined,
      apellido1: this.apellido1 || undefined,
      apellido2: this.apellido2 || undefined
    }
  }

  // ── Repositorio ───────────────────────────────────────────

  getRepository(): ISessionRepository | null {
    return this.repository
  }

  setRepository(repository: ISessionRepository): void {
    this.repository = repository
  }
}
