import 'dotenv/config'
import { app, shell, BrowserWindow, ipcMain, protocol, dialog, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createServices, setupSessionWiring } from './factories/ServiceFactory'
import { setupIPC } from './ipc/handlers'
import { EventBus } from './services/EventBus'
import { TileCacheService } from './tile-cache/TileCacheService'
import { registerTileProtocol } from './tile-cache/TileProtocolHandler'
import { setupLogService, getAppLogPath, readAppLog } from './infrastructure/LogService'
import type { Services } from './factories/ServiceFactory'

const TILE_CACHE_SCHEME = 'tile-cache'

protocol.registerSchemesAsPrivileged([
  {
    scheme: TILE_CACHE_SCHEME,
    privileges: {
      standard: true,
      supportFetchAPI: true,
      bypassCSP: false,
      corsEnabled: false,
      stream: true
    }
  }
])

let mainWindow: BrowserWindow | null = null
let services: Services | null = null
let tileCache: TileCacheService | null = null

function isDebugPanelEnabled(): boolean {
  return services?.config.debugMode ?? process.env['NIR_APP_MODE'] === 'debug'
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.on('ready-to-show', () => {
    window.maximize()
    window.show()
  })

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
    console.log('[Main] Window closed, disconnecting devices...')
    void services?.deviceManager.disconnectAll().catch((err) => {
      console.error('[Main] Error disconnecting devices:', err)
    })
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (app.isPackaged) {
    Menu.setApplicationMenu(null)
    window.webContents.on('devtools-opened', () => {
      window.webContents.closeDevTools()
    })
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const rendererUrl = new URL(process.env['ELECTRON_RENDERER_URL'])
    if (isDebugPanelEnabled()) {
      rendererUrl.searchParams.set('debug', '1')
    }
    window.loadURL(rendererUrl.toString())
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), {
      query: isDebugPanelEnabled() ? { debug: '1' } : {}
    })
  }

  mainWindow = window
  return window
}

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[MAIN] Unhandled Rejection:', reason)
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  setupLogService()
  console.log('[Main] App starting...')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Validación temprana de clave de cifrado en producción
  if (app.isPackaged && !process.env.NIR_DB_ENCRYPTION_KEY) {
    dialog.showErrorBox(
      'Error de configuración',
      'La variable de entorno NIR_DB_ENCRYPTION_KEY no está configurada.\n\n' +
        'Reinstale la aplicación o contacte al administrador del sistema.'
    )
    app.quit()
    return
  }

  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('logs:get-path', async () => {
    return { success: true, path: getAppLogPath() }
  })

  ipcMain.handle('logs:export', async () => {
    try {
      const logContent = readAppLog()
      const desktop = app.getPath('desktop')
      const { writeFileSync } = await import('fs')
      const { join } = await import('path')
      const destPath = join(desktop, `nir-monitor-${Date.now()}.log`)
      writeFileSync(destPath, logContent, 'utf-8')
      return { success: true, path: destPath }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // 1. Initialize tile cache service
  tileCache = new TileCacheService()
  tileCache.ensureBaseDir().catch((err) => {
    console.error('[Main] Failed to create tile cache directory:', err)
  })

  // 2. Register custom protocol for tile caching
  registerTileProtocol(tileCache)

  // 3. Create app services
  services = createServices()

  const eventBus = new EventBus()

  const window = createWindow()
  eventBus.setWindow(window)

  // 4. Setup IPC with tile cache
  setupIPC(
    eventBus,
    services.deviceManager,
    services.sessionService,
    services.exportOrchestrator,
    tileCache ?? undefined
  )

  void services.deviceManager
    .initialize()
    .then(() => {
      console.log('[Main] DeviceManager initialized, setting up session wiring...')
      setupSessionWiring(services!.deviceManager, services!.sessionService)
    })
    .catch((error: unknown) => {
      console.error('[Main] DeviceManager initialization failed:', error)
    })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0 && services) {
      const nextWindow = createWindow()
      const nextEventBus = new EventBus()
      nextEventBus.setWindow(nextWindow)
      setupIPC(
        nextEventBus,
        services.deviceManager,
        services.sessionService,
        services.exportOrchestrator,
        tileCache ?? undefined
      )
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (services?.deviceManager) {
    event.preventDefault()

    const svc = services

    const shutdown = async (): Promise<void> => {
      if (svc.sessionService.getState() === 'running') {
        console.log('[Main] Stopping active session before quit...')
        await svc.sessionService.stop()
      }
      await svc.deviceManager.disconnectAll()
    }

    shutdown()
      .finally(() => app.exit())
      .catch((err) => {
        console.error('[Main] Shutdown error:', err)
        app.exit()
      })
  }
})
