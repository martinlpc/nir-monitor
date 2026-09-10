import { EventEmitter } from 'events'
import * as usb from 'usb'
import type { GeoPosition } from '../../../../shared/GeoTimestamp'
import type { DeviceStatus, IDeviceDriver } from '../../../../shared/device.types'
import type { IGPSDriver } from '../../../../shared/driver-interfaces'
import { AppError } from '../../../../shared/errors/AppError'
import type { DeviceMeta } from '../../../../shared/device.types'
import type { GPSState } from '../gps.types'
import { INITIAL_GPS_STATE } from '../gps.types'
import {
  GARMIN_HEADER_LENGTH,
  GARMIN_LAYER_TRANSPORT,
  GARMIN_PID,
  GARMIN_PID_PRODUCT_DATA,
  GARMIN_PID_PVT_DATA,
  GARMIN_PID_SESSION_RESP,
  GARMIN_USB_PORT_PREFIX,
  GARMIN_VID,
  decodeProductData,
  decodePVT,
  decodeUnitId,
  parseFrame,
  productDataRequestFrame,
  startPvtFrame,
  startSessionFrame,
  stopPvtFrame,
  type GarminFrame,
  type GarminProductData,
  type GarminPVT
} from './GarminUSBProtocol'
import {
  fixToFixType,
  garminPVTToGeoPosition,
  pvtHeadingDeg,
  pvtSpeedKmh
} from './pvtToGeoPosition'

const FIX_LOSS_TIMEOUT_MS = 5000
const COMMAND_TIMEOUT_MS = 3000
const READ_TIMEOUT_MS = 10000
const MAX_PENDING_BYTES = 8192

interface FrameRequest {
  matcher: (frame: GarminFrame) => boolean
  resolve: (frame: GarminFrame) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

export class GarminUSBDriver extends EventEmitter implements IDeviceDriver, IGPSDriver {
  meta: DeviceMeta
  status: DeviceStatus = 'disconnected'

  private device: usb.Device | null = null
  private iface: usb.Interface | null = null
  private inEp: usb.InEndpoint | null = null
  private outEp: usb.OutEndpoint | null = null
  private state: GPSState = { ...INITIAL_GPS_STATE }
  private running = false
  private pending: Buffer = Buffer.alloc(0)
  private sessionRequests: FrameRequest[] = []
  private fixLossTimeoutRef: NodeJS.Timeout | null = null
  private unitId: number | null = null
  private product: GarminProductData | null = null
  private readonly fixLossTimeoutMs: number
  private readonly commandTimeoutMs: number

  constructor(config: { port: string; fixLossTimeoutMs?: number; commandTimeoutMs?: number }) {
    super()
    this.fixLossTimeoutMs = config.fixLossTimeoutMs ?? FIX_LOSS_TIMEOUT_MS
    this.commandTimeoutMs = config.commandTimeoutMs ?? COMMAND_TIMEOUT_MS
    this.meta = {
      id: 'gps-usb',
      name: 'Garmin 18x USB',
      type: 'gps',
      port: config.port || GARMIN_USB_PORT_PREFIX,
      baudRate: 0
    }
  }

  async connect(): Promise<void> {
    if (this.status === 'connecting' || this.status === 'connected') return
    this.setStatus('connecting')

    try {
      const device = usb.findByIds(GARMIN_VID, GARMIN_PID)
      if (!device) {
        throw this.fail('GARMIN_USB_NOT_FOUND', 'No se encontró el Garmin 18x USB conectado')
      }
      this.device = device
      this.openDevice()
      this.iface = this.claimInterface()
      this.inEp = this.findInEndpoint()
      this.outEp = this.findOutEndpoint()
      this.inEp.timeout = READ_TIMEOUT_MS

      this.running = true
      this.startReadLoop()

      await this.sendOut(startSessionFrame())
      const sessionFrame = await this.requestFrame(
        (frame) =>
          frame.packetType === GARMIN_LAYER_TRANSPORT && frame.packetId === GARMIN_PID_SESSION_RESP,
        this.commandTimeoutMs,
        'No hubo respuesta al inicio de sesión del Garmin'
      )
      this.unitId = decodeUnitId(sessionFrame.data)
      this.meta = { ...this.meta, port: `${GARMIN_USB_PORT_PREFIX}:${this.unitId}` }

      await this.sendOut(productDataRequestFrame())
      const productFrame = await this.requestFrame(
        (frame) => frame.packetId === GARMIN_PID_PRODUCT_DATA,
        this.commandTimeoutMs,
        'No se recibió información del producto Garmin'
      )
      this.product = decodeProductData(productFrame.data)

      await this.sendOut(startPvtFrame())
      await this.requestFrame(
        (frame) => frame.packetId === GARMIN_PID_PVT_DATA,
        this.commandTimeoutMs,
        'El Garmin no comenzó a transmitir posición (PVT)'
      )

      this.setStatus('connected')
    } catch (err) {
      this.setStatus('error')
      throw err
    }
  }

  async disconnect(): Promise<void> {
    this.running = false
    if (this.fixLossTimeoutRef) {
      clearTimeout(this.fixLossTimeoutRef)
      this.fixLossTimeoutRef = null
    }
    this.state = { ...INITIAL_GPS_STATE }

    if (this.outEp && this.device) {
      try {
        await this.outEp.transferAsync(stopPvtFrame())
      } catch {
        // best effort
      }
    }

    try {
      this.iface?.release(true)
    } catch {
      // best effort
    }
    try {
      this.device?.close()
    } catch {
      // best effort
    }

    this.device = null
    this.iface = null
    this.inEp = null
    this.outEp = null
    this.unitId = null
    this.product = null
    this.sessionRequests = []
    this.pending = Buffer.alloc(0)

    this.setStatus('disconnected')
  }

  isConnected(): boolean {
    return this.status === 'connected' && this.device !== null
  }

  getLastPosition(): GeoPosition | null {
    if (!this.state.position) return null
    return {
      ...this.state.position,
      nmeaUtcMs: this.state.nmeaTimestamp ?? undefined
    }
  }

  isPositionValid(): boolean {
    return this.state.valid
  }

  getState(): GPSState {
    return { ...this.state }
  }

  getProduct(): GarminProductData | null {
    return this.product ? { ...this.product } : null
  }

  private startReadLoop(): void {
    void this.readLoop()
  }

  private async readLoop(): Promise<void> {
    while (this.running) {
      let buffer: Buffer | undefined
      try {
        buffer = await this.inEp!.transferAsync(4096)
      } catch (err) {
        if (!this.running) break
        const message = err instanceof Error ? err.message : String(err)
        this.emit('error', this.fail('GARMIN_USB_READ_ERROR', `Error de lectura USB: ${message}`))
        this.setStatus('error')
        break
      }
      if (!buffer || buffer.length === 0) continue
      this.ingest(buffer)
    }
  }

  private ingest(chunk: Buffer): void {
    this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk])
    if (this.pending.length > MAX_PENDING_BYTES) {
      this.pending = Buffer.alloc(0)
      return
    }
    while (this.pending.length >= GARMIN_HEADER_LENGTH) {
      const frame = parseFrame(this.pending)
      if (!frame) break
      this.pending = this.pending.subarray(GARMIN_HEADER_LENGTH + frame.dataSize)
      try {
        this.handleFrame(frame)
      } catch (err) {
        console.warn('[GarminUSBDriver] Frame processing error ignored:', err)
      }
    }
  }

  private handleFrame(frame: GarminFrame): void {
    const requestIndex = this.sessionRequests.findIndex((request) => request.matcher(frame))
    if (requestIndex >= 0) {
      const [request] = this.sessionRequests.splice(requestIndex, 1)
      clearTimeout(request.timer)
      request.resolve(frame)
    }
    if (frame.packetId === GARMIN_PID_PRODUCT_DATA) {
      this.product = decodeProductData(frame.data)
      return
    }
    if (frame.packetId === GARMIN_PID_PVT_DATA) {
      const pvt = decodePVT(frame.data)
      if (pvt) this.handlePvt(pvt)
    }
  }

  private handlePvt(pvt: GarminPVT): void {
    const position = garminPVTToGeoPosition(pvt)

    this.state.fixType = fixToFixType(pvt.fix)
    this.state.speed = pvtSpeedKmh(pvt)
    this.state.heading = pvtHeadingDeg(pvt)
    this.state.lastUpdateAt = Date.now()

    if (position) {
      this.state.position = position
      this.state.valid = true
      this.state.nmeaTimestamp = position.nmeaUtcMs ?? null

      if (this.fixLossTimeoutRef) {
        clearTimeout(this.fixLossTimeoutRef)
      }
      this.fixLossTimeoutRef = setTimeout(() => {
        this.state.valid = false
        this.state.position = null
        this.state.nmeaTimestamp = null
        this.emit('fix-lost')
        this.fixLossTimeoutRef = null
      }, this.fixLossTimeoutMs)
    } else {
      this.state.valid = false
    }

    this.emit('position', this.state.position, this.state.valid)
  }

  private sendOut(frame: Buffer): Promise<void> {
    return this.outEp!.transferAsync(frame).then(() => undefined)
  }

  private requestFrame(
    matcher: (frame: GarminFrame) => boolean,
    timeoutMs: number,
    message: string
  ): Promise<GarminFrame> {
    return new Promise<GarminFrame>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.sessionRequests.findIndex((request) => request.resolve === resolve)
        if (index >= 0) this.sessionRequests.splice(index, 1)
        reject(this.fail('GARMIN_USB_HANDSHAKE_FAILED', message))
      }, timeoutMs)
      this.sessionRequests.push({ matcher, resolve, reject, timer })
    })
  }

  private openDevice(): void {
    try {
      this.device!.open()
    } catch (err) {
      throw this.fail(
        'GARMIN_USB_OPEN_FAILED',
        `No se pudo abrir el Garmin 18x USB. Verifique el controlador WinUSB: ${this.messageOf(err)}`
      )
    }
  }

  private claimInterface(): usb.Interface {
    const device = this.device!
    const iface = device.interface(0)
    try {
      iface.claim()
    } catch (err) {
      throw this.fail(
        'GARMIN_USB_CLAIM_FAILED',
        `No se pudo reclamar la interfaz USB del Garmin. Verifique el controlador WinUSB: ${this.messageOf(err)}`
      )
    }
    return iface
  }

  private findInEndpoint(): usb.InEndpoint {
    const endpoint = this.iface!.endpoints.find((endpoint) => endpoint.direction === 'in') as
      | usb.InEndpoint
      | undefined
    if (!endpoint) {
      throw this.fail('GARMIN_USB_ENDPOINT_MISSING', 'El Garmin no expone endpoint USB de entrada')
    }
    return endpoint
  }

  private findOutEndpoint(): usb.OutEndpoint {
    const endpoint = this.iface!.endpoints.find((endpoint) => endpoint.direction === 'out') as
      | usb.OutEndpoint
      | undefined
    if (!endpoint) {
      throw this.fail('GARMIN_USB_ENDPOINT_MISSING', 'El Garmin no expone endpoint USB de salida')
    }
    return endpoint
  }

  private fail(code: string, message: string): AppError {
    return new AppError({
      code,
      message,
      severity: 'error',
      category: 'gps',
      userAction: 'Conecte el Garmin 18x USB y verifique su controlador WinUSB',
      retryable: true,
      deviceId: 'gps'
    })
  }

  private messageOf(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
  }

  private setStatus(status: DeviceStatus): void {
    if (this.status !== status) {
      this.status = status
      this.emit('status', status)
    }
  }
}
