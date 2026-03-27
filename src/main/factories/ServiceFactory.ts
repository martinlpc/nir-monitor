// Factory pattern manual - crea servicios con inyección de dependencias
// Sin dependencias externas (no tsyringe), control total
import { DeviceManager } from '../services/DeviceManager'
import { SessionService } from '../services/SessionService'
import { GeoFusionService } from '../services/GeoFusionService'
import { SerialPortScanner } from '../infrastructure/SerialPortScanner'
import type { ISerialPortScanner } from '../../shared/services/ISerialPortScanner'

export interface Services {
  scanner: ISerialPortScanner
  deviceManager: DeviceManager
  sessionService: SessionService
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

  // 2. Inyectar scanner en DeviceManager
  const deviceManager = new DeviceManager(scanner)

  // 3. Inyectar geoFusion en SessionService
  const sessionService = new SessionService(geoFusion)

  // 4. Wire: DeviceManager eventos → SessionService (configuración manual)
  // (Esto se hace en Application.ts cuando inicializa)

  return {
    scanner,
    deviceManager,
    sessionService,
    geoFusion
  }
}
