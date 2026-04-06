import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createServices, setupSessionWiring } from './factories/ServiceFactory'
import { setupIPC } from './ipc/handlers'
import type { Services } from './factories/ServiceFactory'

let mainWindow: BrowserWindow | null = null
let services: Services | null = null

function isDebugPanelEnabled(): boolean {
  return process.env['NIR_APP_MODE'] === 'debug'
}

function createWindow(): BrowserWindow {
  // Create the browser window.
  const window = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
    // Limpiar conexiones de dispositivos cuando se cierra la ventana
    console.log('[Main] Window closed, disconnecting devices...')
    void services?.deviceManager.disconnectAll().catch((err) => {
      console.error('[Main] Error disconnecting devices:', err)
    })
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Crear servicios con inyección de dependencias
  services = createServices()

  const window = createWindow()
  setupIPC(window, services.deviceManager, services.sessionService)

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
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0 && services) {
      const nextWindow = createWindow()
      setupIPC(nextWindow, services.deviceManager, services.sessionService)
    }
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void services?.deviceManager.disconnectAll().catch(() => {})
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
