import type { INBMDriver } from '../../shared/driver-interfaces'
import type { AppErrorInfo } from '../../shared/errors/error.types'

export const DEFAULT_MAX_CONSECUTIVE_READ_FAILURES = 8
export const NBM_STANDBY_BATTERY_INTERVAL_MS = 30_000

export type PollingMode = 'active' | 'standby'

export interface NBMPollingCallbacks {
  onSample: (sample: { rss: number; unit: string; battery: number; timestamp: number }) => void
  onMaxFailuresExceeded: (port: string, errorInfo: AppErrorInfo) => void
  onBattery?: (battery: number) => void
}

export class NBMPollingController {
  private nbm: INBMDriver | null = null
  private pollTimeout: NodeJS.Timeout | null = null
  private batteryTimeout: NodeJS.Timeout | null = null
  private _polling = false
  private _mode: PollingMode = 'active'
  private sampleCount = 0
  private consecutiveReadFailures = 0
  private port: string = ''
  private maxFailures: number
  private callbacks: NBMPollingCallbacks
  private pollIntervalMs: number

  constructor(
    maxFailures: number = DEFAULT_MAX_CONSECUTIVE_READ_FAILURES,
    callbacks: NBMPollingCallbacks,
    pollIntervalMs: number = 200
  ) {
    this.maxFailures = maxFailures
    this.callbacks = callbacks
    this.pollIntervalMs = pollIntervalMs
  }

  get isPolling(): boolean {
    return this._polling
  }

  get mode(): PollingMode {
    return this._mode
  }

  setSessionActive(active: boolean): void {
    const newMode: PollingMode = active ? 'active' : 'standby'
    if (newMode === this._mode) return

    this._mode = newMode
    console.log(`[NBMPollingController] Mode changed to: ${newMode}`)

    if (!active) {
      this.consecutiveReadFailures = 0
    }
  }

  start(nbm: INBMDriver): void {
    if (this._polling) return

    this._polling = true
    this.nbm = nbm
    this.sampleCount = 0
    this.consecutiveReadFailures = 0
    this._mode = 'standby'
    this.port = nbm.meta.port

    // Leer batería inmediatamente al conectar, luego cada 30s
    void this.readBatteryOnce()
    this.scheduleBatteryRead()
    void this.pollCycle()
  }

  stop(): void {
    this._polling = false
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout)
      this.pollTimeout = null
    }
    if (this.batteryTimeout) {
      clearTimeout(this.batteryTimeout)
      this.batteryTimeout = null
    }
    this.sampleCount = 0
    this.consecutiveReadFailures = 0
  }

  private async readBatteryOnce(): Promise<void> {
    if (!this._polling || !this.nbm?.isConnected()) return

    try {
      const battery = await this.nbm.readBattery()
      if (battery !== null) {
        this.callbacks.onBattery?.(battery)
      }
    } catch (err) {
      console.warn('[NBMPollingController] Battery read error (non-fatal):', err)
    }
  }

  private scheduleBatteryRead(): void {
    if (this.batteryTimeout) clearTimeout(this.batteryTimeout)
    this.batteryTimeout = setTimeout(async () => {
      await this.readBatteryOnce()
      if (this._polling) this.scheduleBatteryRead()
    }, NBM_STANDBY_BATTERY_INTERVAL_MS)
  }

  private async pollCycle(): Promise<void> {
    if (!this._polling || !this.nbm?.isConnected()) {
      this.stop()
      return
    }

    try {
      if (this._mode === 'active') {
        const sample = await this.nbm.readMeasurement()
        if (sample) {
          this.consecutiveReadFailures = 0
          this.callbacks.onSample({
            rss: sample.rss,
            unit: sample.unit,
            battery: sample.battery,
            timestamp: sample.timestamp
          })
        } else {
          this.consecutiveReadFailures++
        }

        if (this.consecutiveReadFailures >= this.maxFailures) {
          const port = this.port || 'desconocido'
          console.error(
            `[NBMPollingController] NBM-550 sin respuesta continua en ${port}; iniciando reconexión automática`
          )
          this.callbacks.onMaxFailuresExceeded(port, {
            code: 'NBM_POLL_FAILURE',
            message: `NBM-550 sin respuesta continua en ${port}`,
            severity: 'error',
            category: 'nbm',
            userAction: 'Verifique el cable USB y que el NBM-550 esté encendido',
            retryable: true,
            deviceId: 'nbm550'
          })
          this.stop()
          return
        }

        this.sampleCount++
        this.pollTimeout = setTimeout(() => void this.pollCycle(), this.pollIntervalMs)
      } else {
        // standby: solo esperar, no medir
        this.pollTimeout = setTimeout(() => void this.pollCycle(), this.pollIntervalMs)
      }
    } catch (err) {
      console.error(`[NBMPollingController] Error en ciclo de polling:`, err)
      if (this._mode === 'active') {
        this.consecutiveReadFailures++
      }
      this.pollTimeout = setTimeout(() => void this.pollCycle(), this.pollIntervalMs)
    }
  }
}
