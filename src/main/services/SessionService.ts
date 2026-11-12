import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { validateCanStart } from './SessionValidator'
import { buildFusionConfig } from './SessionConfigBuilder'
import type { SessionConfigInput } from './SessionConfigBuilder'
import type { GeoTimestamp, GeoPosition } from '../../shared/GeoTimestamp'
import type { INBMDriver, IGPSDriver } from '../../shared/driver-interfaces'
import type { SessionSummary, InstrumentInfo } from '../../shared/ipc.types'
import type { ISessionRepository } from '../../shared/services/ISessionRepository'
import type { IGeoFusionService } from '../../shared/services/IGeoFusionService'
import { CorrectionFactorResolver } from '../uncertainty/correctionFactor'
import { ConfigService } from './ConfigService'
import { AppError } from '../../shared/errors/AppError'
import { MAX_SESSION_POINTS } from '../../shared/config.constants'

export type SessionState = 'idle' | 'running' | 'stopped'

export class SessionService extends EventEmitter {
  private state: SessionState = 'idle'
  private currentSessionId: string | null = null
  private startedAt: number = 0
  private pointCount: number = 0
  private label: string = ''
  private accumulatedPoints: GeoTimestamp[] = []
  private pendingFinalize = false
  private limitReached = false
  private saveFailureNotified = false
  private readonly MAX_SAVE_RETRIES = 3
  private readonly maxPoints: number

  private fusion: IGeoFusionService
  private nbm: INBMDriver | null = null
  private gps: IGPSDriver | null = null
  private repository: ISessionRepository | null = null
  private config: ConfigService | null = null
  private instrument: InstrumentInfo | null = null
  private correctionFactor: number | null = null
  private correctionResolver: CorrectionFactorResolver
  private provincia: string = ''
  private localidad: string = ''
  private apellido1: string = ''
  private apellido2: string = ''

  private resolveCorrectionFactor(probeModel: string | null): number | null {
    return this.correctionResolver.resolve(probeModel)
  }

  private syncCorrectionFactorFromProbe(probeModel: string | null): void {
    const resolved = this.resolveCorrectionFactor(probeModel)
    this.correctionFactor = resolved
    this.fusion.setCorrectionFactor(resolved ?? 1)
    console.log(
      `[SessionService] Correction factor sync -> probe=${probeModel ?? 'N/A'}, factor=${resolved ?? 1}`
    )
  }

  constructor(
    fusion: IGeoFusionService,
    repository?: ISessionRepository,
    config?: ConfigService,
    correctionResolver?: CorrectionFactorResolver,
    options?: { maxPoints?: number }
  ) {
    super()
    this.maxPoints = options?.maxPoints ?? MAX_SESSION_POINTS
    this.fusion = fusion
    this.repository = repository || null
    this.config = config ?? null
    this.correctionResolver = correctionResolver ?? new CorrectionFactorResolver(() => [])

    this.fusion.on('point', (point: GeoTimestamp) => {
      void this.handlePoint(point)
    })
  }

  private async handlePoint(point: GeoTimestamp): Promise<void> {
    // Alcanzado el tope, los puntos que lleguen mientras se cierra la sesión se descartan
    if (this.limitReached) return

    this.pointCount++
    this.accumulatedPoints.push(point)
    console.log(
      `[SessionService] Point captured! Count: ${this.pointCount}, timestamp: ${point.timestamp}`
    )
    this.emit('point', point)

    const sessionId = this.currentSessionId
    if (this.state !== 'running' || !sessionId) return

    const isLastAllowedPoint = this.pointCount >= this.maxPoints
    if (isLastAllowedPoint) this.limitReached = true

    await this.savePointWithRetry(sessionId, point)

    if (isLastAllowedPoint && this.state === 'running' && this.currentSessionId === sessionId) {
      await this.autoStop(
        `Se alcanzó el límite de ${this.maxPoints} puntos por sesión. La medición se detuvo y quedó guardada. Inicie una nueva sesión para continuar.`,
        'warning'
      )
    }
  }

  /** Detiene la sesión sin pedido del usuario y avisa el motivo. */
  private async autoStop(message: string, severity: 'error' | 'warning'): Promise<void> {
    console.warn(`[SessionService] Auto-stopping session: ${message}`)
    this.emit('alert', { message, severity })
    try {
      const summary = await this.stop()
      this.emit('autoStopped', summary)
    } catch (err) {
      console.error('[SessionService] Error auto-stopping session:', err)
    }
  }

  private notifySaveFailure(message: string): void {
    // Un aviso por sesión: con el disco lleno fallaría cada punto
    if (this.saveFailureNotified) return
    this.saveFailureNotified = true
    this.emit('alert', { message, severity: 'error' })
  }

  private async savePointWithRetry(
    sessionId: string,
    point: GeoTimestamp,
    attempts = 0
  ): Promise<void> {
    if (!this.repository) return
    try {
      await this.repository.addPoint(sessionId, point)
    } catch (err) {
      const retryable = !(err instanceof AppError) || err.retryable
      if (retryable && attempts < this.MAX_SAVE_RETRIES) {
        console.warn(
          `[SessionService] Retrying save point (attempt ${attempts + 1}/${this.MAX_SAVE_RETRIES})`
        )
        await new Promise((r) => setTimeout(r, 200 * (attempts + 1)))
        return this.savePointWithRetry(sessionId, point, attempts + 1)
      }
      console.error('[SessionService] Failed to save point:', err)
      this.emit('session:saveError', { sessionId, error: err })
      this.notifySaveFailure(
        'No se pudo guardar un punto de la medición. Verifique el espacio en disco. Si el aviso se repite en una sesión nueva, no continúe midiendo.'
      )
    }
  }

  // ── Registro de devices ───────────────────────────────────

  setNBM(driver: INBMDriver): void {
    this.nbm = driver
    this.fusion.setNBM(driver)
    const probeModel = driver.getProbeInfo()?.model ?? null
    this.syncCorrectionFactorFromProbe(probeModel)
    if (this.state === 'running' && probeModel && this.correctionFactor == null) {
      void this.autoStop(
        `No se encontró factor de corrección para la sonda "${probeModel}". La sesión se detuvo por seguridad.`,
        'error'
      )
    }
  }

  setGPS(driver: IGPSDriver): void {
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
    fusionConfig?: SessionConfigInput,
    locationData?: {
      provincia?: string
      localidad?: string
      apellido1?: string
      apellido2?: string
    }
  ): Promise<string> {
    validateCanStart(this.state, this.nbm, this.gps)

    this.currentSessionId = uuidv4()
    this.startedAt = Date.now()
    this.pointCount = 0
    this.label = label || `Recorrido ${new Date().toLocaleDateString('es-AR')}`
    this.accumulatedPoints = []
    this.limitReached = false
    this.saveFailureNotified = false
    this.correctionFactor = null
    this.provincia = locationData?.provincia || ''
    this.localidad = locationData?.localidad || ''
    this.apellido1 = locationData?.apellido1 || ''
    this.apellido2 = locationData?.apellido2 || ''

    console.log(`[SessionService] Starting session: ${this.currentSessionId}, label: ${this.label}`)
    console.log(`[SessionService] fusionConfig:`, fusionConfig)

    const appConfig = this.config?.loadAppConfig() ?? {}
    const resolved = buildFusionConfig(appConfig, fusionConfig as SessionConfigInput | undefined)

    console.log(`[SessionService] final fusionConfig:`, resolved)
    if (resolved) this.fusion.updateConfig(resolved)

    console.log(`[SessionService] Resetting NBM max hold...`)
    try {
      await this.nbm!.resetMaxHold()
    } catch (err) {
      const isNormalError = err instanceof AppError && err.code === 'NBM_100'
      if (isNormalError) {
        console.warn(`[SessionService] resetMaxHold returned code 100 (normal):`, err.message)
      } else {
        console.warn(`[SessionService] resetMaxHold failed (non-fatal):`, err)
      }
    }

    // Inicializar sesión en el repositorio antes de empezar a capturar
    if (this.repository) {
      const probeInfo = this.nbm!.getProbeInfo()
      const deviceInfo = this.nbm!.getDeviceInfo()

      this.instrument = {
        meter: {
          brand: 'Narda',
          model: 'NBM-550',
          serial: deviceInfo?.serialNumber ?? this.nbm!.getMeterSerial() ?? null,
          lastCalibrationDate: deviceInfo?.calDate ?? null
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
        throw new AppError({
          code: 'SESSION_INIT_FAILED',
          message:
            'No se pudo inicializar la sesión en la base de datos. Verifique el espacio en disco.',
          severity: 'error',
          category: 'session',
          userAction: 'Verifique el espacio en disco y los permisos de escritura',
          retryable: true
        })
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

    if (this.repository && this.currentSessionId) {
      try {
        console.log(
          `[SessionService] Finalizing session with ${this.accumulatedPoints.length} points...`
        )
        await this.repository.finalizeSession(this.currentSessionId, summary)
        this.pendingFinalize = false
        console.log(`[SessionService] Session ${this.currentSessionId} finalized successfully`)
      } catch (err) {
        console.error(`[SessionService] Failed to finalize session: ${err}`)
        this.pendingFinalize = true
        this.emit('session:saveError', { sessionId: this.currentSessionId, error: err })
        this.emit('alert', {
          message:
            'No se pudo cerrar la sesión en la base de datos. Los puntos capturados quedaron resguardados y se recuperarán al reiniciar la aplicación.',
          severity: 'error'
        })
      }
    }

    this.emit('stopped', summary)
    return summary
  }

  // ── Estado ────────────────────────────────────────────────

  getState(): SessionState {
    return this.state
  }

  hasPendingFinalize(): boolean {
    return this.pendingFinalize
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
