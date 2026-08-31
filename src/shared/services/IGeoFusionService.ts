import type { GeoTimestamp } from '../GeoTimestamp'
import type { INBMDriver, IGPSDriver } from '../driver-interfaces'
import type { FusionConfig } from '../FusionConfig'
import type { EventEmitter } from 'events'

/**
 * Contrato de fusión GPS + NBM. Implementación concreta: GeoFusionService.
 * SessionService depende de esta interfaz, no de la implementación,
 * para permitir testear el ciclo de sesión con un fake de fusión.
 */
export interface IGeoFusionService extends EventEmitter {
  setNBM(driver: INBMDriver): void
  setGPS(driver: IGPSDriver): void
  setCorrectionFactor(factor: number): void
  start(sessionId: string): void
  stop(): void
  onGPSPosition(valid: boolean): void
  updateConfig(config: Partial<FusionConfig>): void
  on(event: 'point', listener: (point: GeoTimestamp) => void): this
  on(event: string | symbol, listener: (...args: unknown[]) => void): this
}
