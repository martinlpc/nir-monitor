// Handlers IPC para DeviceManager - sin lógica de negocio
// Solo orquesta: DeviceManager → Renderer
import { ipcMain } from 'electron'
import { IPC_HANDLERS } from './channels'
import { toUserError } from '../../shared/errors/toUserError'
import { checkCalibrationStatus } from '../notifications/calibrationCheck'
import type { DeviceManager } from '../services/DeviceManager'
import type { EventBus } from '../services/EventBus'

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
export function bindDeviceManagerEvents(eventBus: EventBus, deviceManager: DeviceManager): void {
  let lastGpsFixState = false
  const hasBeenConnected = new Set<string>()
  const reconnecting = new Set<string>()
  const alertedProbeSerials = new Set<string>()
  const alertedMeterSerials = new Set<string>()

  deviceManager.on('gps:nmea', (data) => eventBus.send('gps:nmea', data))
  deviceManager.on('gps:position', (data) => eventBus.send('gps:position', data))
  deviceManager.on('gps:fix-lost', () => {
    eventBus.send('gps:fix-lost', null)
    eventBus.alert('Se perdió la señal GPS', 'warning')
  })
  deviceManager.on('nbm:sample', (data) => eventBus.send('nbm:sample', data))
  deviceManager.on('nbm:battery', (battery) => eventBus.send('nbm:battery', battery))
  deviceManager.on('nbm:mode', (mode) => eventBus.send('nbm:mode', mode))
  deviceManager.on('device:status', (data) => {
    eventBus.send('device:status', data)

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
        eventBus.alert( isFirstConnection ? 'GPS conectado' : 'GPS reconectado', 'info')
      } else if (data.deviceId === 'nbm550') {
        eventBus.alert( isFirstConnection ? 'NBM-550 conectado' : 'NBM-550 reconectado', 'info')

        // Verificar calibración de sonda e instrumento
        const nbm = deviceManager.getNBM()
        if (nbm) {
          const probeInfo = nbm.getProbeInfo()
          const deviceInfo = nbm.getDeviceInfo()

          if (probeInfo?.calibrationDate && probeInfo.serial && !alertedProbeSerials.has(probeInfo.serial)) {
            const probeCal = checkCalibrationStatus(probeInfo.calibrationDate)
            if (probeCal.status === 'expired') {
              alertedProbeSerials.add(probeInfo.serial)
              eventBus.alert(
                `Sonda: calibración vencida — ${probeInfo.model ?? 'desconocida'}`,
                'error',
                'Consulte con su superior antes de comenzar la sesión de mediciones'
              )
            } else if (probeCal.status === 'expiring') {
              alertedProbeSerials.add(probeInfo.serial)
              eventBus.alert(
                `Sonda: calibración próxima a vencer — ${probeInfo.model ?? 'desconocida'}`,
                'warning',
                probeCal.message
              )
            }
          }

          if (deviceInfo?.calDate && deviceInfo.serialNumber && !alertedMeterSerials.has(deviceInfo.serialNumber)) {
            const meterCal = checkCalibrationStatus(deviceInfo.calDate)
            if (meterCal.status === 'expired') {
              alertedMeterSerials.add(deviceInfo.serialNumber)
              eventBus.alert(
                'Instrumento: calibración vencida',
                'error',
                'Consulte con su superior antes de comenzar la sesión de mediciones'
              )
            } else if (meterCal.status === 'expiring') {
              alertedMeterSerials.add(deviceInfo.serialNumber)
              eventBus.alert(
                'Instrumento: calibración próxima a vencer',
                'warning',
                meterCal.message
              )
            }
          }
        }
      }
      return
    }

    if (data?.status === 'disconnected' && !data.intentional && data.deviceId) {
      if (reconnecting.has(data.deviceId)) {
        reconnecting.delete(data.deviceId)
        const label = data.deviceId === 'gps' ? 'GPS' : 'NBM-550'
        eventBus.alert(
          `${label} — no se pudo reconectar`,
          'error',
          'Verifique el cable USB y que el dispositivo esté encendido'
        )
        return
      }
      const label = data.deviceId === 'gps' ? 'GPS' : 'NBM-550'
      eventBus.alert(`${label} desconectado`, 'warning')
    }
  })
  deviceManager.on('device:error', (data) => {
    eventBus.send('device:error', data)
    const errorInfo = data.error
    const msg = errorInfo?.message
      ? `[${data.deviceId}] ${errorInfo.message}`
      : `${data.deviceId}: ${data.error}`
    eventBus.alert(msg, 'error', errorInfo?.userAction)
  })
  deviceManager.on('state', (state) => eventBus.send('scan:state', state))
  deviceManager.on('scanning', (scanning) =>
    eventBus.send('scan:state', { ...deviceManager.getState(), scanning })
  )

  // GPS recupera fix (solo una vez por transición)
  deviceManager.on('gps:position', (data) => {
    const isNowValid = data && typeof data.valid === 'boolean' && data.valid === true

    if (isNowValid && !lastGpsFixState) {
      eventBus.alert('GPS con fix', 'info')
    }

    lastGpsFixState = !!isNowValid
  })
}
