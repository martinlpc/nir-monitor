import type { DeviceManager } from './DeviceManager'
import type { SessionService } from './SessionService'
import type { DeviceStatus } from '../../shared/device.types'

export interface SessionSupervisorOptions {
  deviceManager: DeviceManager
  sessionService: SessionService
  stallTimeoutMs?: number
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
}

const DEFAULT_STALL_TIMEOUT_MS = 30_000

interface DeviceStatusEvent {
  deviceId: string
  status: DeviceStatus
  intentional?: boolean
}

/**
 * Conecta DeviceManager con SessionService y supervisa el ciclo de sesión:
 * - Sincroniza el polling del NBM con el estado de la sesión
 * - Watchdog: si el NBM se desconecta durante una sesión activa y no
 *   reconecta en `stallTimeoutMs`, la sesión se detiene automáticamente
 * - Re-wiring de drivers tras reconexiones
 */
export class SessionSupervisor {
  private readonly deviceManager: DeviceManager
  private readonly sessionService: SessionService
  private readonly stallTimeoutMs: number
  private readonly setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  private readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void
  private sessionStallTimer: ReturnType<typeof setTimeout> | null = null

  constructor(opts: SessionSupervisorOptions) {
    this.deviceManager = opts.deviceManager
    this.sessionService = opts.sessionService
    this.stallTimeoutMs = opts.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS
    this.setTimer = opts.setTimer ?? setTimeout
    this.clearTimer = opts.clearTimer ?? clearTimeout
  }

  private clearStallTimer(): void {
    if (this.sessionStallTimer) {
      this.clearTimer(this.sessionStallTimer)
      this.sessionStallTimer = null
    }
  }

  private readonly onSessionStarted = (): void => {
    console.log('[ServiceFactory] Session started → NBM polling active')
    this.deviceManager.setSessionActive(true)
  }

  private readonly onSessionStopped = (): void => {
    console.log('[ServiceFactory] Session stopped → NBM polling standby')
    this.deviceManager.setSessionActive(false)
    if (this.sessionStallTimer) {
      console.log('[ServiceFactory] Session stall watchdog cancelled — session stopped manually')
    }
    this.clearStallTimer()
  }

  private readonly onDeviceStatus = (data: DeviceStatusEvent): void => {
    if (data.deviceId === 'nbm550' && data.status === 'connected') {
      // Cancelar watchdog si estaba activo
      if (this.sessionStallTimer) {
        console.log('[ServiceFactory] Session stall watchdog cancelled — NBM-550 reconnected')
        this.clearStallTimer()
        if (this.sessionService.getState() === 'running') {
          console.log('[ServiceFactory] Alert sent to renderer: "NBM-550 reconectado..."')
          this.sessionService.emit('alert', {
            message: 'NBM-550 reconectado — la sesión continúa normalmente'
          })
        }
      }

      const latestNbm = this.deviceManager.getNBM()
      if (latestNbm) {
        console.log('[ServiceFactory] Re-wiring NBM after reconnection')
        this.sessionService.setNBM(latestNbm)
      }
    } else if (
      data.deviceId === 'nbm550' &&
      (data.status === 'disconnected' || data.status === 'error') &&
      !data.intentional
    ) {
      if (this.sessionService.getState() === 'running' && !this.sessionStallTimer) {
        console.warn(
          '[ServiceFactory] Session stall watchdog started — NBM-550 disconnected while session running, 30s timeout'
        )
        console.warn(
          '[ServiceFactory] Alert sent to renderer: "NBM-550 desconectado — sesión se detendrá en 30s"'
        )
        this.sessionService.emit('alert', {
          message:
            'NBM-550 desconectado — la sesión se detendrá automáticamente en 30s si no se reconecta'
        })
        this.sessionStallTimer = this.setTimer(() => {
          this.sessionStallTimer = null
          if (this.sessionService.getState() === 'running') {
            console.log('[ServiceFactory] Auto-stopping session due to prolonged NBM disconnection')
            this.sessionService.emit('alert', {
              message: 'Sesión detenida por pérdida de comunicación con NBM-550'
            })
            this.sessionService.stop().catch((err) => {
              console.error('[ServiceFactory] Error auto-stopping session:', err)
            })
          }
        }, this.stallTimeoutMs)
      }
    } else if (data.deviceId === 'gps' && data.status === 'connected') {
      const latestGps = this.deviceManager.getGPS()
      if (latestGps) {
        console.log('[ServiceFactory] Re-wiring GPS after reconnection')
        this.sessionService.setGPS(latestGps)
      }
    }
  }

  wire(): void {
    const nbm = this.deviceManager.getNBM()
    const gps = this.deviceManager.getGPS()

    if (nbm) {
      console.log('[ServiceFactory] Wiring NBM to SessionService')
      this.sessionService.setNBM(nbm)
    } else {
      console.warn('[ServiceFactory] NBM not available for wiring')
    }

    if (gps) {
      console.log('[ServiceFactory] Wiring GPS to SessionService')
      this.sessionService.setGPS(gps)
    } else {
      console.warn('[ServiceFactory] GPS not available for wiring')
    }

    this.sessionService.on('started', this.onSessionStarted)
    this.sessionService.on('stopped', this.onSessionStopped)
    this.deviceManager.on('device:status', this.onDeviceStatus)
  }

  dispose(): void {
    this.clearStallTimer()
    this.sessionService.removeListener('started', this.onSessionStarted)
    this.sessionService.removeListener('stopped', this.onSessionStopped)
    this.deviceManager.removeListener('device:status', this.onDeviceStatus)
  }
}
