// Interface pura para GeoFusionService - contrato de fusión geoespacial
// NO importa tipos de main process (evitar circular deps)
import type { EventEmitter } from 'events'

export type TriggerMode = 'distance' | 'time'

export interface ISerialDriver {
  name: string
  portName: string
}

export interface GeoFusionConfig {
  triggerMode: TriggerMode
  minDistanceMeters: number
  intervalMs: number
}

export interface IGeoFusionService extends EventEmitter {
  // Inyección de drivers (types generics para evitar circular deps)
  setNBM(driver: ISerialDriver | null): void
  setGPS(driver: ISerialDriver | null): void

  // Ciclo de vida
  start(sessionId: string): void
  stop(): void

  // Configuración
  updateConfig(config: Partial<GeoFusionConfig>): void

  // Triggers
  onGPSPosition(valid: boolean): void

  // Events: emits 'point' (GeoTimestamp)
  on(event: string, listener: (...args: unknown[]) => void): this
}
