import type { DeviceStatus } from '../../shared/device.types'

export type ReconnectFn = (port: string) => Promise<boolean>

export const DEFAULT_RECONNECT_INTERVAL_MS = 3000
export const DEFAULT_RECONNECT_TIMEOUT_MS = 30000

export class ReconnectController {
  deviceId: string
  private intervalMs: number
  private timeoutMs: number
  private connectFn: ReconnectFn
  private onStatus: (deviceId: string, status: DeviceStatus) => void

  private _reconnecting = false
  private _port: string | null = null
  private _attemptInProgress = false
  private _deadlineReached = false
  private intervalTimer: NodeJS.Timeout | null = null
  private deadlineTimer: NodeJS.Timeout | null = null

  constructor(config: {
    deviceId: string
    intervalMs?: number
    timeoutMs?: number
    connectFn: ReconnectFn
    onStatus: (deviceId: string, status: DeviceStatus) => void
  }) {
    this.deviceId = config.deviceId
    this.intervalMs = config.intervalMs ?? DEFAULT_RECONNECT_INTERVAL_MS
    this.timeoutMs = config.timeoutMs ?? DEFAULT_RECONNECT_TIMEOUT_MS
    this.connectFn = config.connectFn
    this.onStatus = config.onStatus
  }

  get isReconnecting(): boolean {
    return this._reconnecting
  }

  get port(): string | null {
    return this._port
  }

  start(port: string): void {
    if (this._reconnecting) return
    this._reconnecting = true
    this._port = port
    this._deadlineReached = false
    this.stop()
    console.log(
      `[ReconnectController:${this.deviceId}] Unexpected disconnect — retrying for ${this.timeoutMs / 1000}s...`
    )
    this.onStatus(this.deviceId, 'connecting')

    const attemptReconnect = async (): Promise<void> => {
      if (!this._reconnecting) return
      console.log(`[ReconnectController:${this.deviceId}] Reconnect attempt on ${port}...`)
      this._attemptInProgress = true
      try {
        const success = await this.connectFn(port)
        if (success) {
          console.log(`[ReconnectController:${this.deviceId}] Reconnected successfully`)
          this._reconnecting = false
          this.stop()
          return
        }
      } catch (err) {
        console.warn(`[ReconnectController:${this.deviceId}] Reconnect attempt failed:`, err)
      } finally {
        this._attemptInProgress = false
      }

      if (!this._reconnecting && this._deadlineReached) {
        this.onStatus(this.deviceId, 'disconnected')
        return
      }

      if (this._reconnecting) {
        this.intervalTimer = setTimeout(attemptReconnect, this.intervalMs)
      }
    }

    this.intervalTimer = setTimeout(attemptReconnect, this.intervalMs)
    this.deadlineTimer = setTimeout(() => {
      console.log(`[ReconnectController:${this.deviceId}] Reconnect timeout — giving up`)
      this._reconnecting = false
      this.stop()
      if (!this._attemptInProgress) {
        this.onStatus(this.deviceId, 'disconnected')
      } else {
        this._deadlineReached = true
      }
    }, this.timeoutMs)
  }

  stop(): void {
    if (this.intervalTimer) {
      clearTimeout(this.intervalTimer)
      this.intervalTimer = null
    }
    if (this.deadlineTimer) {
      clearTimeout(this.deadlineTimer)
      this.deadlineTimer = null
    }
  }

  reset(): void {
    this._reconnecting = false
    this._deadlineReached = false
    this.stop()
  }
}
