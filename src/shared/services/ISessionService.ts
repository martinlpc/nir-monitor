// Interface para SessionService - contrato de sesión
// NO importa tipos de main process (evitar circular deps)
import type { EventEmitter } from 'events'
import type { ISerialDriver } from './IGeoFusionService'

export type SessionState = 'idle' | 'running' | 'stopped'

export interface GeoFusionConfig {
  triggerMode: 'distance' | 'time'
  minDistanceMeters: number
  intervalMs: number
}

export interface SessionSummary {
  label: string
  timestamp: number
  pointsCount: number
}

export interface ISessionService extends EventEmitter {
  // Inyección de drivers
  setNBM(driver: ISerialDriver | null): void
  setGPS(driver: ISerialDriver | null): void

  // Ciclo de vida sesión
  start(label?: string, fusionConfig?: Partial<GeoFusionConfig>): Promise<string>
  stop(): Promise<void>

  // Estado
  getState(): SessionState
  getCurrentSessionId(): string | null
  getSummary(): SessionSummary | null

  // Events: emits 'point', 'started', 'stopped'
  on(event: string, listener: (...args: unknown[]) => void): this
}
