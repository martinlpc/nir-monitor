import { ipcMain, app } from 'electron'
import { SerialPort } from 'serialport'
import { writeFileSync } from 'fs'
import { registerDeviceManagerHandlers, bindDeviceManagerEvents } from './DeviceManagerHandler'
import { registerSessionServiceHandlers, bindSessionServiceEvents } from './SessionServiceHandler'
import { registerSettingsHandlers } from './SettingsHandler'
import { registerTileCacheHandlers } from './TileCacheHandler'
import { registerDriverHandlers } from './DriverHandler'
import { registerPortsHandlers } from './PortsHandler'
import { registerLogsHandlers } from './LogsHandler'
import { getAppLogPath, readAppLog } from '../infrastructure/LogService'
import { DriverDetector } from '../drivers/DriverDetector'
import { DriverInstaller } from '../drivers/DriverInstaller'
import type { DeviceManager } from '../services/DeviceManager'
import type { SessionService } from '../services/SessionService'
import type { TileCacheService } from '../tile-cache/TileCacheService'
import type { ExportOrchestrator } from '../export/ExportOrchestator'
import type { EventBus } from '../services/EventBus'
import type { ProbeDataService } from '../uncertainty/loadBuiltInData'

export function setupIPC(
  eventBus: EventBus,
  deviceManager: DeviceManager,
  sessionService: SessionService,
  exportOrchestrator: ExportOrchestrator,
  probeDataService: ProbeDataService,
  tileCache?: TileCacheService
): void {
  deviceManager.removeAllListeners()
  sessionService.removeAllListeners()

  console.log('[IPC] Setting up IPC handlers...')

  const detector = new DriverDetector()
  const installer = new DriverInstaller()

  registerDriverHandlers(ipcMain, {
    checkDrivers: () => detector.check(),
    installDriver: (driverType) => installer.install(driverType)
  })
  registerPortsHandlers(ipcMain, async () => {
    const ports = await SerialPort.list()
    return ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer }))
  })
  registerLogsHandlers(ipcMain, {
    logPath: getAppLogPath(),
    readLog: readAppLog,
    getDesktopPath: () => app.getPath('desktop'),
    writeFile: writeFileSync,
    now: () => Date.now()
  })
  registerDeviceManagerHandlers(deviceManager)
  registerSessionServiceHandlers(eventBus, sessionService, exportOrchestrator)
  registerSettingsHandlers(deviceManager, probeDataService)

  if (tileCache) {
    const window = eventBus.getWindow()
    if (window) {
      registerTileCacheHandlers(window, eventBus, tileCache)
    }
  }

  bindDeviceManagerEvents(eventBus, deviceManager)
  bindSessionServiceEvents(eventBus, sessionService)

  console.log('[IPC] All IPC handlers and event listeners registered')

  const win = eventBus.getWindow()
  win?.on('closed', () => {
    console.log('[IPC] Window closed - cleaning up listeners')
    deviceManager.removeAllListeners()
    sessionService.removeAllListeners()
  })
}
