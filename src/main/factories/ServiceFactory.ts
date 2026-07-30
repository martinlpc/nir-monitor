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

export interface Services {
  scanner: ISerialPortScanner
  deviceManager: DeviceManager
  sessionService: SessionService
  sessionRepository: ISessionRepository
  geoFusion: GeoFusionService
  config: ConfigService
  exportOrchestrator: ExportOrchestrator
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
  const sessionService = new SessionService(geoFusion, sessionRepository, config)

  return {
    scanner,
    deviceManager,
    sessionService,
    sessionRepository,
    geoFusion,
    config,
    exportOrchestrator
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

  // ── Watchdog de sesión estancada ─────────────────────────────
  // Si el NBM se desconecta durante una sesión activa y no reconecta
  // en 30s, la sesión se detiene automáticamente.
  let sessionStallTimer: NodeJS.Timeout | null = null
  const SESSION_STALL_TIMEOUT_MS = 30_000

  const clearStallTimer = (): void => {
    if (sessionStallTimer) {
      clearTimeout(sessionStallTimer)
      sessionStallTimer = null
    }
  }

  // Re-wire cuando DeviceManager reinicia un dispositivo
  deviceManager.on(
    'device:status',
    (data: { deviceId: string; status: string; intentional?: boolean }) => {
      if (data.deviceId === 'nbm550' && data.status === 'connected') {
        // Cancelar watchdog si estaba activo
        if (sessionStallTimer) {
          console.log('[ServiceFactory] Session stall watchdog cancelled — NBM-550 reconnected')
          clearStallTimer()
          if (sessionService.getState() === 'running') {
            console.log('[ServiceFactory] Alert sent to renderer: "NBM-550 reconectado..."')
            sessionService.emit('alert', {
              message: 'NBM-550 reconectado — la sesión continúa normalmente'
            })
          }
        }

        const latestNbm = deviceManager.getNBM()
        if (latestNbm) {
          console.log('[ServiceFactory] Re-wiring NBM after reconnection')
          sessionService.setNBM(latestNbm)
        }
      } else if (
        data.deviceId === 'nbm550' &&
        (data.status === 'disconnected' || data.status === 'error') &&
        !data.intentional
      ) {
        if (sessionService.getState() === 'running' && !sessionStallTimer) {
          console.warn(
            '[ServiceFactory] Session stall watchdog started — NBM-550 disconnected while session running, 30s timeout'
          )
          console.warn(
            '[ServiceFactory] Alert sent to renderer: "NBM-550 desconectado — sesión se detendrá en 30s"'
          )
          sessionService.emit('alert', {
            message:
              'NBM-550 desconectado — la sesión se detendrá automáticamente en 30s si no se reconecta'
          })
          sessionStallTimer = setTimeout(() => {
            sessionStallTimer = null
            if (sessionService.getState() === 'running') {
              console.log(
                '[ServiceFactory] Auto-stopping session due to prolonged NBM disconnection'
              )
              sessionService.emit('alert', {
                message: 'Sesión detenida por pérdida de comunicación con NBM-550'
              })
              sessionService.stop().catch((err) => {
                console.error('[ServiceFactory] Error auto-stopping session:', err)
              })
            }
          }, SESSION_STALL_TIMEOUT_MS)
        }
      } else if (data.deviceId === 'gps' && data.status === 'connected') {
        const latestGps = deviceManager.getGPS()
        if (latestGps) {
          console.log('[ServiceFactory] Re-wiring GPS after reconnection')
          sessionService.setGPS(latestGps)
        }
      }
    }
  )

  // Limpiar watchdog si la sesión se detiene manualmente
  sessionService.on('stopped', () => {
    if (sessionStallTimer) {
      console.log('[ServiceFactory] Session stall watchdog cancelled — session stopped manually')
    }
    clearStallTimer()
  })
}
