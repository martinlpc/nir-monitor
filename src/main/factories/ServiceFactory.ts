// Factory pattern manual - crea servicios con inyección de dependencias
// Sin dependencias externas (no tsyringe), control total
import { DeviceManager } from '../services/DeviceManager'
import { SessionService } from '../services/SessionService'
import { GeoFusionService } from '../services/GeoFusionService'
import { SQLiteSessionRepository } from '../services/SQLiteSessionRepository'
import { SerialPortScanner } from '../infrastructure/SerialPortScanner'
import type { ISerialPortScanner } from '../../shared/services/ISerialPortScanner'
import type { ISessionRepository } from '../../shared/services/ISessionRepository'

export interface Services {
  scanner: ISerialPortScanner
  deviceManager: DeviceManager
  sessionService: SessionService
  sessionRepository: ISessionRepository
  geoFusion: GeoFusionService
}

/**
 * Factory pattern para crear servicios con inyección de dependencias
 * Retorna todas las instancias ya configuradas y "wireadas"
 */
export function createServices(): Services {
  // 1. Crear dependencias base (sin dependencias)
  const scanner = new SerialPortScanner()
  const geoFusion = new GeoFusionService()
  const sessionRepository = new SQLiteSessionRepository()

  // 2. Inyectar scanner en DeviceManager
  const deviceManager = new DeviceManager(scanner)

  // 3. Inyectar geoFusion y repositorio en SessionService
  const sessionService = new SessionService(geoFusion, sessionRepository)

  // 4. Wire: después de que DeviceManager.initialize() se complete,
  // necesitamos pasar las referencias de NBM y GPS a SessionService
  // Esto se hace en setupSessionWiring() que se llama desde index.ts
  // después de que deviceManager.initialize() se complete

  return {
    scanner,
    deviceManager,
    sessionService,
    sessionRepository,
    geoFusion
  }
}

/**
 * Completa la wiring entre DeviceManager y SessionService
 * Debe llamarse DESPUÉS de que deviceManager.initialize() se complete
 */
export function setupSessionWiring(
  deviceManager: DeviceManager,
  sessionService: SessionService
): void {
  const nbm = deviceManager.getNBM()
  const gps = deviceManager.getGPS()

  if (nbm) {
    console.log('[ServiceFactory] Wiring NBM to SessionService')
    sessionService.setNBM(nbm)
  } else {
    console.warn('[ServiceFactory] NBM not available for wiring')
  }

  if (gps) {
    console.log('[ServiceFactory] Wiring GPS to SessionService')
    sessionService.setGPS(gps)
  } else {
    console.warn('[ServiceFactory] GPS not available for wiring')
  }

  // Re-wire cuando DeviceManager reinicia un dispositivo
  deviceManager.on('device:status', (data: { deviceId: string; status: string }) => {
    if (data.deviceId === 'nbm550' && data.status === 'connected') {
      const latestNbm = deviceManager.getNBM()
      if (latestNbm) {
        console.log('[ServiceFactory] Re-wiring NBM after reconnection')
        sessionService.setNBM(latestNbm)
      }
    } else if (data.deviceId === 'gps' && data.status === 'connected') {
      const latestGps = deviceManager.getGPS()
      if (latestGps) {
        console.log('[ServiceFactory] Re-wiring GPS after reconnection')
        sessionService.setGPS(latestGps)
      }
    }
  })
}
