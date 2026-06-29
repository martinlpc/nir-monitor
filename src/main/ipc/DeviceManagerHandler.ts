// Handlers IPC para DeviceManager - sin lógica de negocio
// Solo orquesta: DeviceManager → Renderer
import { ipcMain, BrowserWindow } from 'electron'
import { IPC_EVENTS, IPC_HANDLERS } from './channels'
import { emitAlert } from './handlers'
import { toUserError } from '../../shared/errors/toUserError'
import type { DeviceManager } from '../services/DeviceManager'

function sanitizeReThrow(err: unknown): never {
  const { message, technical } = toUserError(err)
  console.error(`[IPC] ${technical}`)
  throw new Error(message)
}

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
    try {
      return deviceManager.getState()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  // device:scan - dispara escaneo de puertos
  ipcMain.handle(IPC_HANDLERS.DEVICE_SCAN, async () => {
    try {
      return await deviceManager.scan()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  // device:set-port - configura puerto manualmente
  ipcMain.handle(IPC_HANDLERS.DEVICE_SET_PORT, async (_, device: string, port: string) => {
    try {
      await deviceManager.setPortManual(device as 'nbm550' | 'gps', port)
      return deviceManager.getState()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  // device:connect - reconecta un dispositivo ya configurado
  ipcMain.handle(IPC_HANDLERS.DEVICE_CONNECT, async (_, deviceId: string) => {
    try {
      await deviceManager.connectDevice(deviceId as 'nbm550' | 'gps')
      return deviceManager.getState()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  // device:disconnect - desconecta un dispositivo específico
  ipcMain.handle(IPC_HANDLERS.DEVICE_DISCONNECT, async (_, deviceId: string) => {
    try {
      await deviceManager.disconnectDevice(deviceId as 'nbm550' | 'gps')
      return deviceManager.getState()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })
}

/**
 * Vincula eventos de DeviceManager → Renderer (push)
 * Los eventos se emiten continuamente, no need for handler
 */
export function bindDeviceManagerEvents(window: BrowserWindow, deviceManager: DeviceManager): void {
  let lastGpsFixState = false
  const hasBeenConnected = new Set<string>()
  const reconnecting = new Set<string>()

  const sendIfReady = (event: string, data: unknown): void => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(event, data)
    }
  }

  deviceManager.on('gps:nmea', (data) => sendIfReady(IPC_EVENTS.GPS_NMEA, data))
  deviceManager.on('gps:position', (data) => sendIfReady(IPC_EVENTS.GPS_POSITION, data))
  deviceManager.on('gps:fix-lost', () => {
    sendIfReady(IPC_EVENTS.GPS_FIX_LOST, null)
    emitAlert(
      window,
      'Se perdió la señal GPS',
      'warning',
      'Despeje la vista al cielo o acérquese a una ventana'
    )
  })
  deviceManager.on('nbm:sample', (data) => sendIfReady(IPC_EVENTS.NBM_SAMPLE, data))
  deviceManager.on('nbm:battery', (battery) => sendIfReady(IPC_EVENTS.NBM_BATTERY, battery))
  deviceManager.on('nbm:mode', (mode) => sendIfReady(IPC_EVENTS.NBM_MODE, mode))
  deviceManager.on('device:status', (data) => {
    sendIfReady(IPC_EVENTS.DEVICE_STATUS, data)

    if (data?.status === 'connecting' && data.deviceId) {
      reconnecting.add(data.deviceId)
      return
    }

    if (data?.status === 'connected' && data.deviceId) {
      reconnecting.delete(data.deviceId)
      const isFirstConnection = !hasBeenConnected.has(data.deviceId)
      if (isFirstConnection) {
        hasBeenConnected.add(data.deviceId)
      }
      if (data.deviceId === 'gps') {
        emitAlert(window, isFirstConnection ? 'GPS conectado' : 'GPS reconectado', 'info')
      } else if (data.deviceId === 'nbm550') {
        emitAlert(window, isFirstConnection ? 'NBM-550 conectado' : 'NBM-550 reconectado', 'info')
      }
      return
    }

    if (data?.status === 'disconnected' && !data.intentional && data.deviceId) {
      if (reconnecting.has(data.deviceId)) {
        reconnecting.delete(data.deviceId)
        const label = data.deviceId === 'gps' ? 'GPS' : 'NBM-550'
        emitAlert(
          window,
          `${label} — no se pudo reconectar`,
          'error',
          'Verifique el cable USB y que el dispositivo esté encendido'
        )
        return
      }
      const label = data.deviceId === 'gps' ? 'GPS' : 'NBM-550'
      emitAlert(window, `${label} desconectado`, 'warning')
    }
  })
  deviceManager.on('device:error', (data) => {
    sendIfReady(IPC_EVENTS.DEVICE_ERROR, data)
    const errorInfo = data.error
    const msg = errorInfo?.message
      ? `[${data.deviceId}] ${errorInfo.message}`
      : `${data.deviceId}: ${data.error}`
    emitAlert(window, msg, 'error', errorInfo?.userAction)
  })
  deviceManager.on('state', (state) => sendIfReady(IPC_EVENTS.SCAN_STATE, state))
  deviceManager.on('scanning', (scanning) =>
    sendIfReady(IPC_EVENTS.SCAN_STATE, { ...deviceManager.getState(), scanning })
  )

  // GPS recupera fix (solo una vez por transición)
  deviceManager.on('gps:position', (data) => {
    const isNowValid = data && typeof data.valid === 'boolean' && data.valid === true

    if (isNowValid && !lastGpsFixState) {
      emitAlert(window, 'GPS con fix', 'info')
    }

    lastGpsFixState = !!isNowValid
  })
}
