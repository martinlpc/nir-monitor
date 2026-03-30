// Handlers IPC para DeviceManager - sin lógica de negocio
// Solo orquesta: DeviceManager → Renderer
import { ipcMain, BrowserWindow } from 'electron'
import { IPC_EVENTS, IPC_HANDLERS } from './channels'
import type { DeviceManager } from '../services/DeviceManager'

/**
 * Registra handlers IPC para operaciones de dispositivos
 * Responsabilidad: solo orquestar, sin lógica de negocio
 */
export function registerDeviceManagerHandlers(
  _window: BrowserWindow,
  deviceManager: DeviceManager
): void {
  // device:list - retorna estado actual de dispositivos
  ipcMain.handle(IPC_HANDLERS.DEVICE_LIST, async () => {
    return deviceManager.getState()
  })

  // device:scan - dispara escaneo de puertos
  ipcMain.handle(IPC_HANDLERS.DEVICE_SCAN, async () => {
    return await deviceManager.scan()
  })

  // device:set-port - configura puerto manualmente
  ipcMain.handle(IPC_HANDLERS.DEVICE_SET_PORT, async (_, device: string, port: string) => {
    await deviceManager.setPortManual(device as 'nbm550' | 'gps', port)
    return deviceManager.getState()
  })

  // device:disconnect - desconecta todos los dispositivos
  ipcMain.handle(IPC_HANDLERS.DEVICE_DISCONNECT, async () => {
    await deviceManager.disconnectAll()
    return deviceManager.getState()
  })
}

/**
 * Vincula eventos de DeviceManager → Renderer (push)
 * Los eventos se emiten continuamente, no need for handler
 */
export function bindDeviceManagerEvents(window: BrowserWindow, deviceManager: DeviceManager): void {
  const sendIfReady = (event: string, data: unknown) => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(event, data)
    }
  }

  deviceManager.on('gps:nmea', (data) => sendIfReady(IPC_EVENTS.GPS_NMEA, data))
  deviceManager.on('gps:position', (data) => sendIfReady(IPC_EVENTS.GPS_POSITION, data))
  deviceManager.on('gps:fix-lost', () => sendIfReady(IPC_EVENTS.GPS_FIX_LOST, null))
  deviceManager.on('nbm:sample', (data) => sendIfReady(IPC_EVENTS.NBM_SAMPLE, data))
  deviceManager.on('device:status', (data) => sendIfReady(IPC_EVENTS.DEVICE_STATUS, data))
  deviceManager.on('device:error', (data) => sendIfReady(IPC_EVENTS.DEVICE_ERROR, data))
  deviceManager.on('state', (state) => sendIfReady(IPC_EVENTS.SCAN_STATE, state))
  deviceManager.on('scanning', (scanning: boolean) =>
    sendIfReady(IPC_EVENTS.SCAN_STATE, { ...deviceManager.getState(), scanning })
  )
}
