// Handlers IPC para DeviceManager - sin lógica de negocio
// Solo orquesta: DeviceManager → Renderer
import { IPC_HANDLERS } from './channels'
import type { IpcMainLike, EventSink } from './ipcEnv'
import { sanitizeReThrow } from './ipcEnv'
import { DeviceEventPresenter } from './DeviceEventPresenter'
import type { DeviceEventSourceLike } from './DeviceEventPresenter'
import type { DeviceManagerState } from '../services/DeviceManager'

export interface DeviceManagerHandlerDeps {
  getState: () => DeviceManagerState
  scan: () => Promise<DeviceManagerState>
  setPortManual: (device: 'nbm550' | 'gps', port: string) => Promise<void>
  connectDevice: (deviceId: 'nbm550' | 'gps') => Promise<void>
  disconnectDevice: (deviceId: 'nbm550' | 'gps') => Promise<void>
}

/**
 * Registra handlers IPC para operaciones de dispositivos
 * Responsabilidad: solo orquestar, sin lógica de negocio
 */
export function registerDeviceManagerHandlers(
  ipc: IpcMainLike,
  deps: DeviceManagerHandlerDeps
): void {
  // device:list - retorna estado actual de dispositivos
  ipc.handle(IPC_HANDLERS.DEVICE_LIST, async () => {
    try {
      return deps.getState()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  // device:scan - dispara escaneo de puertos
  ipc.handle(IPC_HANDLERS.DEVICE_SCAN, async () => {
    try {
      return await deps.scan()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  // device:set-port - configura puerto manualmente
  ipc.handle(IPC_HANDLERS.DEVICE_SET_PORT, async (_, device: string, port: string) => {
    try {
      await deps.setPortManual(device as 'nbm550' | 'gps', port)
      return deps.getState()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  // device:connect - reconecta un dispositivo ya configurado
  ipc.handle(IPC_HANDLERS.DEVICE_CONNECT, async (_, deviceId: string) => {
    try {
      await deps.connectDevice(deviceId as 'nbm550' | 'gps')
      return deps.getState()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  // device:disconnect - desconecta un dispositivo específico
  ipc.handle(IPC_HANDLERS.DEVICE_DISCONNECT, async (_, deviceId: string) => {
    try {
      await deps.disconnectDevice(deviceId as 'nbm550' | 'gps')
      return deps.getState()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })
}

/**
 * Vincula eventos de DeviceManager → Renderer (push)
 * Los eventos se emiten continuamente, no need for handler
 */
export function bindDeviceManagerEvents(eventSink: EventSink, source: DeviceEventSourceLike): void {
  new DeviceEventPresenter(eventSink).bind(source)
}
