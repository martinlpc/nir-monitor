import type { NBM550Driver } from '../devices/nbm550/NBM550Driver'

export const DEFAULT_MAX_CONSECUTIVE_READ_FAILURES = 8
export const NBM_POLL_INTERVAL_MS = 200

export interface NBMPollingCallbacks {
  onSample: (sample: { rss: number; unit: string; battery: number; timestamp: number }) => void
  onMaxFailuresExceeded: (port: string, message: string) => void
}

export class NBMPollingController {
  private nbm: NBM550Driver | null = null
  private pollTimeout: NodeJS.Timeout | null = null
  private _polling = false
  private sampleCount = 0
  private consecutiveReadFailures = 0
  private port: string = ''
  private maxFailures: number
  private callbacks: NBMPollingCallbacks
  private pollIntervalMs: number

  constructor(
    maxFailures: number = DEFAULT_MAX_CONSECUTIVE_READ_FAILURES,
    callbacks: NBMPollingCallbacks,
    pollIntervalMs: number = NBM_POLL_INTERVAL_MS
  ) {
    this.maxFailures = maxFailures
    this.callbacks = callbacks
    this.pollIntervalMs = pollIntervalMs
  }

  get isPolling(): boolean {
    return this._polling
  }

  start(nbm: NBM550Driver): void {
    if (this._polling) return

    this._polling = true
    this.nbm = nbm
    this.sampleCount = 0
    this.consecutiveReadFailures = 0
    this.port = nbm.meta.port

    void this.pollCycle()
  }

  stop(): void {
    this._polling = false
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout)
      this.pollTimeout = null
    }
    this.sampleCount = 0
    this.consecutiveReadFailures = 0
  }

  private async pollCycle(): Promise<void> {
    if (!this._polling || !this.nbm?.isConnected()) {
      this.stop()
      return
    }

    try {
      // Leer batería cada 5 muestras (cada ~1 segundo con 200ms intervalo)
      if (this.sampleCount % 5 === 0) {
        const battery = await this.nbm.readBattery()
        if (battery === null) {
          this.consecutiveReadFailures++
        }
      }

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
        const message = `NBM-550 sin respuesta continua en ${port}; iniciando reconexión automática`
        console.error(`[NBMPollingController] ${message}`)
        this.callbacks.onMaxFailuresExceeded(port, message)
        this.stop()
        return
      }

      this.sampleCount++
    } catch {
      // Silenciar errores de lectura - el dispositivo puede estar ocupado
    }

    this.pollTimeout = setTimeout(() => void this.pollCycle(), this.pollIntervalMs)
  }
}
