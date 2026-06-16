import { EventEmitter } from 'events'
import type { GeoPosition } from '../../../shared/GeoTimestamp'
import type { IDeviceDriver, DeviceStatus, DeviceMeta } from '../../../shared/device.types'
import type { GPSState } from '../gps/gps.types'
import { INITIAL_GPS_STATE } from '../gps/gps.types'

export class SimulatedGPSDriver extends EventEmitter implements IDeviceDriver {
  readonly meta: DeviceMeta
  status: DeviceStatus = 'disconnected'

  private state: GPSState = { ...INITIAL_GPS_STATE }
  private positionTimer: NodeJS.Timeout | null = null
  private readonly CENTER_LAT = -34.6037
  private readonly CENTER_LON = -58.3816
  private readonly RADIUS = 0.002
  private readonly STEPS_PER_LEG = 30
  private step = 0
  private leg = 0

  constructor(config: { port: string }) {
    super()
    this.meta = {
      id: 'gps-sim',
      name: 'GPS Simulado',
      type: 'gps',
      port: config.port,
      baudRate: 4800
    }
  }

  async connect(): Promise<void> {
    this.setStatus('connecting')
    await new Promise((resolve) => setTimeout(resolve, 500))
    this.step = 0
    this.leg = 0
    this.state = { ...INITIAL_GPS_STATE }
    this.setStatus('connected')
    this.startEmitting()
  }

  async disconnect(): Promise<void> {
    this.stopEmitting()
    this.state = { ...INITIAL_GPS_STATE }
    this.setStatus('disconnected')
  }

  isConnected(): boolean {
    return this.status === 'connected'
  }

  getLastPosition(): GeoPosition | null {
    return this.state.position
  }

  isPositionValid(): boolean {
    return this.state.valid
  }

  getState(): GPSState {
    return { ...this.state }
  }

  private startEmitting(): void {
    this.emitNextPosition()
    this.positionTimer = setInterval(() => this.emitNextPosition(), 1000)
  }

  private stopEmitting(): void {
    if (this.positionTimer) {
      clearInterval(this.positionTimer)
      this.positionTimer = null
    }
  }

  private emitNextPosition(): void {
    const headings = [0, 90, 180, 270]
    const headingDeg = headings[this.leg]
    const rad = (headingDeg * Math.PI) / 180

    const progress = this.step / this.STEPS_PER_LEG
    const deltaLat = this.RADIUS * Math.cos(rad) * progress
    const deltaLon = this.RADIUS * Math.sin(rad) * progress

    const pos: GeoPosition = {
      lat: this.CENTER_LAT + deltaLat,
      lon: this.CENTER_LON + deltaLon,
      alt: 25 + Math.random() * 5
    }

    this.state.position = pos
    this.state.valid = true
    this.state.fixType = '3d'
    this.state.satelliteCount = Math.floor(8 + Math.random() * 5)
    this.state.speed = 25 + Math.random() * 10
    this.state.heading = headingDeg
    this.state.lastUpdateAt = Date.now()

    this.emit('position', pos, true)

    this.step++
    if (this.step >= this.STEPS_PER_LEG) {
      this.step = 0
      this.leg = (this.leg + 1) % 4
    }
  }

  private setStatus(status: DeviceStatus): void {
    if (this.status !== status) {
      this.status = status
      this.emit('status', status)
    }
  }
}
