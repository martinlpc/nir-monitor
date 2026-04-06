import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { GeoFusionService, type GeoFusionConfig } from './GeoFusionService'
import type { GeoTimestamp, GeoPosition } from '../../shared/GeoTimestamp'
import type { NBM550Driver } from '../devices/nbm550/NBM550Driver'
import type { GPSDriver } from '../devices/gps/GPSDriver'
import type { SessionSummary } from '../../shared/ipc.types'
import type { ISessionRepository } from '../../shared/services/ISessionRepository'

export type SessionState = 'idle' | 'running' | 'stopped'

export class SessionService extends EventEmitter {
  private state: SessionState = 'idle'
  private currentSessionId: string | null = null
  private startedAt: number = 0
  private pointCount: number = 0
  private label: string = ''
  private accumulatedPoints: GeoTimestamp[] = []

  private fusion: GeoFusionService
  private nbm: NBM550Driver | null = null
  private gps: GPSDriver | null = null
  private repository: ISessionRepository | null = null

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

  setNBM(driver: NBM550Driver): void {
    this.nbm = driver
    this.fusion.setNBM(driver)
  }

  setGPS(driver: GPSDriver): void {
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

  async start(label: string = '', fusionConfig?: Partial<GeoFusionConfig>): Promise<string> {
    if (this.state === 'running') {
      throw new Error('Ya hay una sesión en curso')
    }
    if (!this.nbm?.isConnected()) throw new Error('NBM-550 no conectado')
    if (!this.gps?.isConnected()) throw new Error('GPS no conectado')

    this.currentSessionId = uuidv4()
    this.startedAt = Date.now()
    this.pointCount = 0
    this.label = label || `Recorrido ${new Date().toLocaleDateString('es-AR')}`
    this.accumulatedPoints = []

    console.log(`[SessionService] Starting session: ${this.currentSessionId}, label: ${this.label}`)
    console.log(`[SessionService] fusionConfig:`, fusionConfig)

    // En modo test, usar trigger por tiempo para capturar cada varios segundos
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
      try {
        await this.repository.initSession(this.currentSessionId, {
          id: this.currentSessionId,
          label: this.label,
          startedAt: this.startedAt,
          stoppedAt: null,
          sampleCount: 0
        })
      } catch (err) {
        console.error('[SessionService] Failed to init session in repository:', err)
      }
    }

    console.log(`[SessionService] Calling fusion.start()...`)
    this.fusion.start(this.currentSessionId)
    this.state = 'running'

    console.log(`[SessionService] Session started successfully, state: running`)
    this.emit('started', {
      sessionId: this.currentSessionId,
      startedAt: this.startedAt,
      label: this.label
    })

    return this.currentSessionId
  }

  async stop(): Promise<SessionSummary> {
    if (this.state !== 'running') {
      throw new Error('No hay sesión en curso')
    }

    console.log(`[SessionService] Stopping session, total points: ${this.pointCount}`)
    this.fusion.stop()
    this.state = 'stopped'

    const summary: SessionSummary = {
      id: this.currentSessionId!,
      label: this.label,
      startedAt: this.startedAt,
      stoppedAt: Date.now(),
      sampleCount: this.pointCount
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
      sampleCount: this.pointCount
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
