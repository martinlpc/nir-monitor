import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

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
import { KmzExporter } from '../export/KmzExporter'
import { ExportOrchestrator } from '../export/ExportOrchestator'
import { GeoJsonExporter } from '../export/GeoJsonExporter'
import { XlsxExporter } from '../export/XlsxExporter'
import type { IExporter, TemplateResolver } from '../export/IExporter'
import { CorrectionFactorResolver } from '../uncertainty/correctionFactor'
import { ProbeDataService } from '../uncertainty/loadBuiltInData'
import { SessionSupervisor } from '../services/SessionSupervisor'

export interface Services {
  scanner: ISerialPortScanner
  deviceManager: DeviceManager
  sessionService: SessionService
  sessionRepository: ISessionRepository
  geoFusion: GeoFusionService
  config: ConfigService
  exportOrchestrator: ExportOrchestrator
  probeDataService: ProbeDataService
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
  const iconPath = path.join(app.getAppPath(), 'resources', 'icon.png')
  const iconBuffer = fs.existsSync(iconPath) ? fs.readFileSync(iconPath) : null
  const kmzExporter = new KmzExporter(app.getVersion(), iconBuffer)

  const templateDir = app.isPackaged
    ? path.join(process.resourcesPath, 'plantillas')
    : path.join(app.getAppPath(), 'resources', 'plantillas')
  const templateResolver: TemplateResolver = async (name) => {
    const filePath = path.join(templateDir, name)
    return fs.promises.readFile(filePath) as Promise<Buffer>
  }
  const xlsxExporter = new XlsxExporter(templateResolver, app.getVersion())

  const exportOrchestrator = new ExportOrchestrator(
    sessionRepository,
    new Map<string, IExporter<string | Buffer | string[]>>([
      ['geojson', new GeoJsonExporter()],
      ['kmz', kmzExporter],
      ['xlsx', xlsxExporter]
    ])
  )

  // 2. Inyectar scanner y factory en DeviceManager
  const deviceManager = new DeviceManager(scanner, driverFactory, config)

  // 3. Inyectar geoFusion y repositorio en SessionService
  const probeDataService = new ProbeDataService(
    (filePath: string) => {
      if (!fs.existsSync(filePath)) return null
      return fs.readFileSync(filePath, 'utf-8')
    },
    () =>
      app.isPackaged
        ? path.join(process.resourcesPath, 'probe-data.json')
        : path.join(app.getAppPath(), 'resources', 'probe-data.json')
  )
  const correctionResolver = new CorrectionFactorResolver(() => probeDataService.load())
  const sessionService = new SessionService(
    geoFusion,
    sessionRepository,
    config,
    correctionResolver
  )

  return {
    scanner,
    deviceManager,
    sessionService,
    sessionRepository,
    geoFusion,
    config,
    exportOrchestrator,
    probeDataService
  }
}

/**
 * Completa la wiring entre DeviceManager y SessionService
 * Debe llamarse DESPUÉS de que deviceManager.initialize() se complete
 */
export function setupSessionWiring(
  deviceManager: DeviceManager,
  sessionService: SessionService
): SessionSupervisor {
  const supervisor = new SessionSupervisor({ deviceManager, sessionService })
  supervisor.wire()
  return supervisor
}
