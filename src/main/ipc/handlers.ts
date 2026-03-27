import { ipcMain, BrowserWindow } from 'electron'
import { SerialPort } from 'serialport'
import { IPC_EVENTS, IPC_HANDLERS } from './channels'
import type { DeviceManager } from '../services/DeviceManager'
import type { SessionService } from '../services/SessionService'

// -- Setup -----------------------------------------------------------
// Registrar handlers y conectar eventos de servicios hacia el Renderer
// vía webContents.send()

export function setupIPC(
  window: BrowserWindow,
  deviceManager: DeviceManager,
  sessionService: SessionService
): void {
  // CRÍTICO: Limpiar listeners viejos ANTES de registrar nuevos
  // Esto previene duplicados cuando se abre múltiples ventanas o al recargar
  deviceManager.removeAllListeners('gps:nmea')
  deviceManager.removeAllListeners('gps:position')
  deviceManager.removeAllListeners('nbm:sample')
  deviceManager.removeAllListeners('device:status')
  deviceManager.removeAllListeners('device:error')
  deviceManager.removeAllListeners('state')
  deviceManager.removeAllListeners('scanning')

  sessionService.removeAllListeners('point')
  sessionService.removeAllListeners('started')
  sessionService.removeAllListeners('stopped')

  bindDeviceManagerEvents(window, deviceManager)
  bindSessionServiceEvents(window, sessionService)
  registerHandlers(deviceManager, sessionService)
}

// -- Eventos Main -> Renderer ----------------------------------------

function bindDeviceManagerEvents(window: BrowserWindow, dm: DeviceManager): void {
  const onGpsNmea = (data): void => {
    // No loguear cada NMEA para evitar stderr overflow
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(IPC_EVENTS.GPS_NMEA, data)
    }
  }

  const onGpsPosition = (data): void => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(IPC_EVENTS.GPS_POSITION, data)
    }
  }

  const onGpsFixLost = (): void => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(IPC_EVENTS.GPS_FIX_LOST)
    }
  }

  const onNbmSample = (data): void => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(IPC_EVENTS.NBM_SAMPLE, data)
    }
  }

  const onDeviceStatus = (data): void => {
    console.log(`[IPC] onDeviceStatus received:`, data)
    if (!window.webContents.isDestroyed()) {
      console.log(`[IPC] Sending DEVICE_STATUS to renderer:`, data)
      window.webContents.send(IPC_EVENTS.DEVICE_STATUS, data)
    } else {
      console.log(`[IPC] webContents destroyed, cannot send DEVICE_STATUS`)
    }
  }

  const onDeviceError = (data): void => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(IPC_EVENTS.DEVICE_ERROR, data)
    }
  }

  const onState = (state): void => {
    // No loguear state para evitar verbosidad
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(IPC_EVENTS.SCAN_STATE, state)
    }
  }

  const onScanning = (scanning: boolean): void => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(IPC_EVENTS.SCAN_STATE, {
        ...dm.getState(),
        scanning
      })
    }
  }

  dm.on('gps:nmea', onGpsNmea)
  dm.on('gps:position', onGpsPosition)
  dm.on('gps:fix-lost', onGpsFixLost)
  dm.on('nbm:sample', onNbmSample)
  dm.on('device:status', onDeviceStatus)
  dm.on('device:error', onDeviceError)
  dm.on('state', onState)
  dm.on('scanning', onScanning)

  console.log('[IPC] ✓ DeviceManager event listeners registered')

  window.on('closed', () => {
    console.log('[IPC] Cleaning up DeviceManager listeners')
    dm.off('gps:nmea', onGpsNmea)
    dm.off('gps:position', onGpsPosition)
    dm.off('nbm:sample', onNbmSample)
    dm.off('device:status', onDeviceStatus)
    dm.off('device:error', onDeviceError)
    dm.off('state', onState)
    dm.off('scanning', onScanning)
  })
}

function bindSessionServiceEvents(window: BrowserWindow, ss: SessionService): void {
  const onPoint = (point): void => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(IPC_EVENTS.SESSION_SAMPLE, point)
    }
  }

  const onStarted = (data): void => {
    console.log('[IPC] Session started:', data)
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(IPC_EVENTS.SESSION_STARTED, data)
    }
  }

  const onStopped = (data): void => {
    console.log('[IPC] Session stopped:', data)
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(IPC_EVENTS.SESSION_STOPPED, data)
    }
  }

  ss.on('point', onPoint)
  ss.on('started', onStarted)
  ss.on('stopped', onStopped)

  console.log('[IPC] ✓ All SessionService event listeners registered')

  window.on('closed', () => {
    console.log('[IPC] ✓ Window closed - cleaning up SessionService listeners')
    ss.off('point', onPoint)
    ss.off('started', onStarted)
    ss.off('stopped', onStopped)
  })
}

// -- Handlers Renderer -> Main ----------------------------------------

function registerHandlers(dm: DeviceManager, ss: SessionService): void {
  // Listar puertos COM disponibles
  ipcMain.handle(IPC_HANDLERS.PORTS_LIST, async () => {
    const ports = await SerialPort.list()
    return ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer ?? '' }))
  })

  // Estado actual de los dispositivos
  ipcMain.handle(IPC_HANDLERS.DEVICE_LIST, () => {
    return dm.getState()
  })

  // Re-scan automático de puertos
  ipcMain.handle(IPC_HANDLERS.DEVICE_SCAN, async () => {
    return await dm.scan()
  })

  // Asignación manual de puerto
  ipcMain.handle(
    IPC_HANDLERS.DEVICE_SET_PORT,
    async (_, device: 'nbm550' | 'gps', port: string) => {
      await dm.setPortManual(device, port)
      return dm.getState()
    }
  )

  // Conectar un dispositivo específico
  ipcMain.handle(IPC_HANDLERS.DEVICE_CONNECT, async (_, deviceId: 'nbm550' | 'gps') => {
    if (deviceId === 'nbm550') {
      const nbm = dm.getNBM()
      if (!nbm) throw new Error('NBM-550 no encontrado')
      if (!nbm.isConnected()) {
        await nbm.connect()
      }
    } else {
      const gps = dm.getGPS()
      if (!gps) throw new Error('GPS no encontrado')
      if (!gps.isConnected()) {
        await gps.connect()
      }
    }
  })

  // Desconectar un dispositivo específico
  ipcMain.handle(IPC_HANDLERS.DEVICE_DISCONNECT, async (_, deviceId: 'nbm550' | 'gps') => {
    if (deviceId === 'nbm550') {
      await dm.getNBM()?.disconnect()
    } else {
      await dm.getGPS()?.disconnect()
    }
  })

  // Iniciar recorrido
  ipcMain.handle(
    IPC_HANDLERS.SESSION_START,
    async (
      _,
      payload: {
        label?: string
        triggerMode?: 'distance' | 'time'
        minDistanceMeters?: number
        intervalMs?: number
      }
    ) => {
      const nbm = dm.getNBM()
      const gps = dm.getGPS()

      if (!nbm) throw new Error('NBM-550 no encontrado')
      if (!gps) throw new Error('GPS no encontrado')

      // Setear drivers en SessionService
      ss.setNBM(nbm)
      ss.setGPS(gps)

      return await ss.start(payload.label, {
        triggerMode: payload.triggerMode,
        minDistanceMeters: payload.minDistanceMeters,
        intervalMs: payload.intervalMs
      })
    }
  )

  // Finalizar recorrido
  ipcMain.handle(IPC_HANDLERS.SESSION_STOP, async () => {
    return await ss.stop()
  })
}
