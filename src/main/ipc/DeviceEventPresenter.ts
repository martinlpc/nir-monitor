import type { EventSink } from './ipcEnv'
import type { DeviceManagerState } from '../services/DeviceManager'
import type { INBMDriver } from '../../shared/driver-interfaces'
import type { DeviceStatus } from '../../shared/device.types'
import type { AppErrorInfo } from '../../shared/errors/error.types'
import type { GeoPosition } from '../../shared/GeoTimestamp'
import { checkCalibrationStatus } from '../notifications/calibrationCheck'

export interface DeviceStatusEvent {
  deviceId: string
  status: DeviceStatus
  intentional?: boolean
}

export interface DeviceErrorEvent {
  deviceId: string
  error: AppErrorInfo
}

export interface GpsPositionEvent {
  coords: GeoPosition | null
  valid: boolean
  port: string
}

export interface DeviceEventSourceLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): unknown
  getNBM(): INBMDriver | null
  getState(): DeviceManagerState
}

/**
 * Traduce eventos de DeviceManager en alerts y push al renderer.
 * Contiene toda la lógica de presentación stateful: detección de fix,
 * reconexión, y alertas de calibración con dedup por serial.
 */
export class DeviceEventPresenter {
  private lastGpsFixState = false
  private readonly hasBeenConnected = new Set<string>()
  private readonly reconnecting = new Set<string>()
  private readonly alertedProbeSerials = new Set<string>()
  private readonly alertedMeterSerials = new Set<string>()

  constructor(
    private readonly eventSink: EventSink,
    private readonly checkCalibration: typeof checkCalibrationStatus = checkCalibrationStatus
  ) {}

  bind(source: DeviceEventSourceLike): void {
    source.on('gps:nmea', (data) => this.eventSink.send('gps:nmea', data))
    source.on('gps:position', (data: GpsPositionEvent) => this.onPosition(data))
    source.on('gps:fix-lost', () => {
      this.eventSink.send('gps:fix-lost', null)
      this.eventSink.alert('Se perdió la señal GPS', 'warning')
    })
    source.on('nbm:sample', (data) => this.eventSink.send('nbm:sample', data))
    source.on('nbm:battery', (battery) => this.eventSink.send('nbm:battery', battery))
    source.on('nbm:mode', (mode) => this.eventSink.send('nbm:mode', mode))
    source.on('device:status', (data: DeviceStatusEvent) => this.onDeviceStatus(data, source))
    source.on('device:error', (data: DeviceErrorEvent) => this.onDeviceError(data))
    source.on('state', (state) => this.eventSink.send('scan:state', state))
    source.on('scanning', (scanning: boolean) =>
      this.eventSink.send('scan:state', { ...source.getState(), scanning })
    )
  }

  private onPosition(data: GpsPositionEvent): void {
    this.eventSink.send('gps:position', data)

    const isNowValid = data && typeof data.valid === 'boolean' && data.valid === true

    if (isNowValid && !this.lastGpsFixState) {
      this.eventSink.alert('GPS con fix', 'info')
    }

    this.lastGpsFixState = !!isNowValid
  }

  private onDeviceStatus(data: DeviceStatusEvent, source: DeviceEventSourceLike): void {
    this.eventSink.send('device:status', data)

    if (data?.status === 'connecting' && data.deviceId) {
      this.reconnecting.add(data.deviceId)
      return
    }

    if (data?.status === 'connected' && data.deviceId) {
      this.reconnecting.delete(data.deviceId)
      const isFirstConnection = !this.hasBeenConnected.has(data.deviceId)
      if (isFirstConnection) {
        this.hasBeenConnected.add(data.deviceId)
      }
      if (data.deviceId === 'gps') {
        this.eventSink.alert(isFirstConnection ? 'GPS conectado' : 'GPS reconectado', 'info')
      } else if (data.deviceId === 'nbm550') {
        this.eventSink.alert(
          isFirstConnection ? 'NBM-550 conectado' : 'NBM-550 reconectado',
          'info'
        )
        this.checkCalibrationAlerts(source)
      }
      return
    }

    if (data?.status === 'disconnected' && !data.intentional && data.deviceId) {
      if (this.reconnecting.has(data.deviceId)) {
        this.reconnecting.delete(data.deviceId)
        const label = data.deviceId === 'gps' ? 'GPS' : 'NBM-550'
        this.eventSink.alert(
          `${label} — no se pudo reconectar`,
          'error',
          'Verifique el cable USB y que el dispositivo esté encendido'
        )
        return
      }
      const label = data.deviceId === 'gps' ? 'GPS' : 'NBM-550'
      this.eventSink.alert(`${label} desconectado`, 'warning')
    }
  }

  private onDeviceError(data: DeviceErrorEvent): void {
    this.eventSink.send('device:error', data)
    const errorInfo = data.error
    const msg =
      typeof errorInfo === 'object' && errorInfo?.message
        ? `[${data.deviceId}] ${errorInfo.message}`
        : `${data.deviceId}: ${String(data.error)}`
    this.eventSink.alert(
      msg,
      'error',
      typeof errorInfo === 'object' ? errorInfo.userAction : undefined
    )
  }

  private checkCalibrationAlerts(source: DeviceEventSourceLike): void {
    const nbm = source.getNBM()
    if (!nbm) return

    const probeInfo = nbm.getProbeInfo()
    const deviceInfo = nbm.getDeviceInfo()

    if (
      probeInfo?.calibrationDate &&
      probeInfo.serial &&
      !this.alertedProbeSerials.has(probeInfo.serial)
    ) {
      const probeCal = this.checkCalibration(probeInfo.calibrationDate)
      if (probeCal.status === 'expired') {
        this.alertedProbeSerials.add(probeInfo.serial)
        this.eventSink.alert(
          `Sonda: calibración vencida — ${probeInfo.model ?? 'desconocida'}`,
          'error',
          'Consulte con su superior antes de comenzar la sesión de mediciones'
        )
      } else if (probeCal.status === 'expiring') {
        this.alertedProbeSerials.add(probeInfo.serial)
        this.eventSink.alert(
          `Sonda: calibración próxima a vencer — ${probeInfo.model ?? 'desconocida'}`,
          'warning',
          probeCal.message
        )
      }
    }

    if (
      deviceInfo?.calDate &&
      deviceInfo.serialNumber &&
      !this.alertedMeterSerials.has(deviceInfo.serialNumber)
    ) {
      const meterCal = this.checkCalibration(deviceInfo.calDate)
      if (meterCal.status === 'expired') {
        this.alertedMeterSerials.add(deviceInfo.serialNumber)
        this.eventSink.alert(
          'Instrumento: calibración vencida',
          'error',
          'Consulte con su superior antes de comenzar la sesión de mediciones'
        )
      } else if (meterCal.status === 'expiring') {
        this.alertedMeterSerials.add(deviceInfo.serialNumber)
        this.eventSink.alert(
          'Instrumento: calibración próxima a vencer',
          'warning',
          meterCal.message
        )
      }
    }
  }
}
