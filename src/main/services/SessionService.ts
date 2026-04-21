import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { GeoFusionService, type GeoFusionConfig } from './GeoFusionService'
import type { GeoTimestamp, GeoPosition } from '../../shared/GeoTimestamp'
import type { NBM550Driver } from '../devices/nbm550/NBM550Driver'
import type { GPSDriver } from '../devices/gps/GPSDriver'
import type { SessionSummary, InstrumentInfo } from '../../shared/ipc.types'
import type { ISessionRepository } from '../../shared/services/ISessionRepository'
import { getLoadedUncertainty } from '../ipc/SettingsHandler'
import { loadAppConfig } from './AppConfig'
import { existsSync, readFileSync } from 'fs'

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
  private instrument: InstrumentInfo | null = null
  private correctionFactor: number | null = null

  private normalizeProbeName(name: string): string {
    return name.toUpperCase().replace(/[^A-Z0-9]/g, '')
  }

  private resolveCorrectionFactor(probeModel: string | null): number | null {
    if (!probeModel) return null
    const normalizedProbe = this.normalizeProbeName(probeModel)
    const findFactor = (records: Array<{ name: string; factor: number }>): number | null => {
      const matched =
        records.find((r) => this.normalizeProbeName(r.name) === normalizedProbe) ??
        records.find((r) => {
          const normalizedRecord = this.normalizeProbeName(r.name)
          return (
            normalizedProbe.includes(normalizedRecord) || normalizedRecord.includes(normalizedProbe)
          )
        })
      return matched?.factor ?? null
    }

    const loaded = getLoadedUncertainty()
    if (loaded?.records?.length) {
      const factor = findFactor(loaded.records)
      if (factor != null) return factor
    }

    // Fallback: leer directamente desde archivo configurado para evitar carreras
    // cuando el auto-load de Settings todavía no terminó al iniciar sesión.
    const config = loadAppConfig()
    const filePath = config.uncertaintyFilePath
    if (!filePath || !existsSync(filePath)) return null

    try {
      const content = readFileSync(filePath, 'utf-8')
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)
      if (lines.length <= 1) return null
      const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','
      const records = lines
        .slice(1)
        .map((line) => {
          const cols = line.split(sep).map((c) => c.trim())
          return { name: cols[0] || '', factor: parseFloat(cols[4]) || 1 }
        })
        .filter((r) => r.name.length > 0)

      return findFactor(records)
    } catch (err) {
      console.warn('[SessionService] Could not read uncertainty file for correction factor:', err)
      return null
    }
  }

  private syncCorrectionFactorFromProbe(probeModel: string | null): void {
    const resolved = this.resolveCorrectionFactor(probeModel)
    this.correctionFactor = resolved
    this.fusion.setUncertaintyFactor(resolved ?? 1)
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

  setNBM(driver: NBM550Driver): void {
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
    if (!this.gps.isPositionValid()) {
      throw new Error('GPS sin fix: espere a obtener señal antes de iniciar la sesión')
    }

    this.currentSessionId = uuidv4()
    this.startedAt = Date.now()
    this.pointCount = 0
    this.label = label || `Recorrido ${new Date().toLocaleDateString('es-AR')}`
    this.accumulatedPoints = []
    this.correctionFactor = null

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
      const probeInfo = this.nbm.getProbeInfo()

      this.instrument = {
        meter: {
          brand: 'Narda',
          model: 'NBM-550',
          serial: null,
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
        const message = `No se encontró factor de corrección para la sonda "${probeModel}". No se puede iniciar la sesión.`
        this.emit('alert', { message })
        throw new Error(message)
      }

      try {
        await this.repository.initSession(this.currentSessionId, {
          id: this.currentSessionId,
          label: this.label,
          startedAt: this.startedAt,
          stoppedAt: null,
          sampleCount: 0,
          instrument: this.instrument,
          correctionFactor: this.correctionFactor
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
      sampleCount: this.pointCount,
      instrument: this.instrument,
      correctionFactor: this.correctionFactor
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
      correctionFactor: this.correctionFactor
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
