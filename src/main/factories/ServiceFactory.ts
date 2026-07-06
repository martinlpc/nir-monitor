import { DeviceManager } from '../services/DeviceManager'
import { SessionService } from '../services/SessionService'
import { GeoFusionService } from '../services/GeoFusionService'
import { SQLiteSessionRepository } from '../services/SQLiteSessionRepository'
import { SerialPortScanner } from '../infrastructure/SerialPortScanner'
import { RealDriverFactory } from './RealDriverFactory'
import { SimulatedDriverFactory } from './SimulatedDriverFactory'
import { ConfigService } from '../services/ConfigService'
import type { ISerialPortScanner } from '../../shared/services/ISerialPortScanner'
import type { ISessionRepository } from '../../shared/services/ISessionRepository'
import type { DriverFactory } from '../../shared/driver-factory'

export interface Services {
  scanner: ISerialPortScanner
  deviceManager: DeviceManager
  sessionService: SessionService
  sessionRepository: ISessionRepository
  geoFusion: GeoFusionService
  config: ConfigService
}

function createSimulatedScanner(): ISerialPortScanner {
  return {
    listAvailablePorts: async () => ['COM-sim'],
    scanAndProbeAll: async () => ({
      nbmPort: 'COM-sim',
      gpsPort: 'COM-sim',
      allProbed: []
    }),
    probeNBM: async () => true,
    probeGPS: async () => true
  }
}

/**
 * Factory pattern para crear servicios con inyección de dependencias
 * Retorna todas las instancias ya configuradas y "wireadas"
 */
export function createServices(): Services {
  const config = new ConfigService()
  console.log(`[ServiceFactory] simulationMode: ${config.simulationMode}`)

  // 1. Crear dependencias base
  const scanner: ISerialPortScanner = config.simulationMode
    ? createSimulatedScanner()
    : new SerialPortScanner()
  const driverFactory: DriverFactory = config.simulationMode
    ? new SimulatedDriverFactory()
    : new RealDriverFactory()
  const geoFusion = new GeoFusionService()
  const flushCfg = config.flushConfig
  const sessionRepository = new SQLiteSessionRepository({
    flushEveryNPoints: flushCfg.everyNPoints,
    flushIntervalMs: flushCfg.intervalMs
  })

  // 2. Inyectar scanner y factory en DeviceManager
  const deviceManager = new DeviceManager(scanner, driverFactory, config)

  // 3. Inyectar geoFusion y repositorio en SessionService
  const sessionService = new SessionService(geoFusion, sessionRepository, config)

  return {
    scanner,
    deviceManager,
    sessionService,
    sessionRepository,
    geoFusion,
    config
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

  // Sincronizar polling NBM con estado de sesión
  sessionService.on('started', () => {
    console.log('[ServiceFactory] Session started → NBM polling active')
    deviceManager.setSessionActive(true)
  })

  sessionService.on('stopped', () => {
    console.log('[ServiceFactory] Session stopped → NBM polling standby')
    deviceManager.setSessionActive(false)
  })

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
