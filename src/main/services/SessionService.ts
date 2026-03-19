import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { GeoFusionService, type GeoFusionConfig } from './GeoFusionService'
import type { GeoTimestamp, GeoPosition } from '../../shared/GeoTimestamp'
import type { NBM550Driver } from '../devices/nbm550/NBM550Driver'
import type { GPSDriver } from '../devices/gps/GPSDriver'
import type { SessionSummary } from '../../shared/ipc.types'

export type SessionState = 'idle' | 'running' | 'stopped'

export class SessionService extends EventEmitter {
  private state: SessionState = 'idle'
  private currentSessionId: string | null = null
  private startedAt: number = 0
  private pointCount: number = 0
  private label: string = ''

  private fusion: GeoFusionService
  private nbm: NBM550Driver | null = null
  private gps: GPSDriver | null = null

  constructor() {
    super()
    this.fusion = new GeoFusionService()

    this.fusion.on('point', (point: GeoTimestamp) => {
      this.pointCount++
      this.emit('point', point)
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

    if (fusionConfig) this.fusion.updateConfig(fusionConfig)

    // Descarta todo lo acumulado durante conexión y configuración
    await this.nbm.resetMaxHold()

    this.fusion.start(this.currentSessionId)
    this.state = 'running'

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

    this.fusion.stop()
    this.state = 'stopped'

    const summary: SessionSummary = {
      id: this.currentSessionId!,
      label: this.label,
      startedAt: this.startedAt,
      stoppedAt: Date.now(),
      sampleCount: this.pointCount
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
}
