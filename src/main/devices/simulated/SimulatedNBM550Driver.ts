import { EventEmitter } from 'events'
import type { NBM550Sample, NBM550ProbeInfo } from '../nbm550/nbm550.types'
import type { IDeviceDriver, DeviceStatus, DeviceMeta } from '../../../shared/device.types'

export class SimulatedNBM550Driver extends EventEmitter implements IDeviceDriver {
  readonly meta: DeviceMeta
  status: DeviceStatus = 'disconnected'

  private startTime: number = 0
  private currentBattery: number = 100
  private probeInfo: NBM550ProbeInfo = {
    model: 'EF-0391',
    serial: 'SIM-00001',
    calibrationDate: '2024-06-01'
  }

  constructor(config: { port: string }) {
    super()
    this.meta = {
      id: 'nbm-sim',
      name: 'NBM-550 Simulado',
      type: 'nbm550',
      port: config.port,
      baudRate: 460800
    }
  }

  async connect(): Promise<void> {
    this.setStatus('connecting')
    await new Promise((resolve) => setTimeout(resolve, 500))
    this.startTime = Date.now()
    this.currentBattery = 100
    this.setStatus('connected')
  }

  async disconnect(): Promise<void> {
    this.setStatus('disconnected')
  }

  isConnected(): boolean {
    return this.status === 'connected'
  }

  async readMeasurement(): Promise<NBM550Sample | null> {
    if (!this.isConnected()) return null
    const t = Date.now() - this.startTime
    const raw = 0.8 + 29.2 * (0.5 + 0.5 * Math.sin(t / 10000)) + (Math.random() - 0.5) * 2
    return {
      rss: Math.max(0.8, Math.min(30, Math.round(raw * 100) / 100)),
      unit: 'V/m',
      battery: this.currentBattery,
      timestamp: t
    }
  }

  async readBattery(): Promise<number | null> {
    if (!this.isConnected()) return null
    const t = Date.now() - this.startTime
    this.currentBattery = Math.max(10, 100 - Math.floor(t / 120000))
    return this.currentBattery
  }

  async resetMaxHold(): Promise<void> {
    // no-op en simulación
  }

  getProbeInfo(): NBM550ProbeInfo | null {
    return this.probeInfo
  }

  private setStatus(status: DeviceStatus): void {
    if (this.status !== status) {
      this.status = status
      this.emit('status', status)
    }
  }
}
