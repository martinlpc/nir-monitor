import { ipcMain, BrowserWindow } from 'electron'
import { SerialPort } from 'serialport'
import { IPC_EVENTS, IPC_HANDLERS } from './channels'
import type { DeviceManager } from '../services/DeviceManager'
import type { SessionService } from '../services/SessionService'
import type { GeoPosition } from '../../shared/GeoTimestamp'

let handlersRegistered = false

// -- Setup -----------------------------------------------------------
// Registrar handlers y conectar eventos de servicios hacia el Renderer
// vía webContents.send()

export function setupIPC(
  window: BrowserWindow,
  deviceManager: DeviceManager,
  sessionService: SessionService
): void {
  bindDeviceManagerEvents(window, deviceManager)
  bindSessionServiceEvents(window, sessionService)

  if (!handlersRegistered) {
    registerHandlers(deviceManager, sessionService)
    handlersRegistered = true
  }
}

// -- Eventos Main -> Renderer ----------------------------------------

function bindDeviceManagerEvents(window: BrowserWindow, dm: DeviceManager): void {
  const onDeviceStatus = (data): void => {
    window.webContents.send(IPC_EVENTS.DEVICE_STATUS, data)
  }

  const onDeviceError = (data): void => {
    window.webContents.send(IPC_EVENTS.DEVICE_ERROR, data)
  }

  const onState = (state): void => {
    window.webContents.send(IPC_EVENTS.SCAN_STATE, state)
  }

  const onScanning = (scanning: boolean): void => {
    window.webContents.send(IPC_EVENTS.SCAN_STATE, {
      ...dm.getState(),
      scanning
    })
  }

  dm.on('device:status', onDeviceStatus)
  dm.on('device:error', onDeviceError)
  dm.on('state', onState)
  dm.on('scanning', onScanning)

  window.on('closed', () => {
    dm.off('device:status', onDeviceStatus)
    dm.off('device:error', onDeviceError)
    dm.off('state', onState)
    dm.off('scanning', onScanning)
  })
}

function bindSessionServiceEvents(window: BrowserWindow, ss: SessionService): void {
  const onPoint = (point): void => {
    window.webContents.send(IPC_EVENTS.SESSION_SAMPLE, point)
  }

  const onPosition = (coords: GeoPosition, valid: boolean): void => {
    window.webContents.send(IPC_EVENTS.GPS_POSITION, { coords, valid })
  }

  const onStarted = (data): void => {
    window.webContents.send(IPC_EVENTS.SESSION_STARTED, data)
  }

  const onStopped = (data): void => {
    window.webContents.send(IPC_EVENTS.SESSION_STOPPED, data)
  }

  ss.on('point', onPoint)
  ss.on('position', onPosition)
  ss.on('started', onStarted)
  ss.on('stopped', onStopped)

  window.on('closed', () => {
    ss.off('point', onPoint)
    ss.off('position', onPosition)
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
      await nbm.connect()
    } else {
      const gps = dm.getGPS()
      if (!gps) throw new Error('GPS no encontrado')
      await gps.connect()
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
