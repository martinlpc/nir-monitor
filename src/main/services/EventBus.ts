import type { BrowserWindow } from 'electron'
import type { DeviceStatus } from '../../shared/device.types'
import type { GeoPosition, GeoTimestamp } from '../../shared/GeoTimestamp'
import type { SessionSummary, InstrumentInfo } from '../../shared/ipc.types'
import type { AppErrorInfo } from '../../shared/errors/error.types'
import type { PreloadProgress } from '../../shared/tile.types'
import { AlertLogger } from '../infrastructure/AlertLogger'

export interface EventMap {
  'gps:position': { coords: GeoPosition | null; valid: boolean; port: string }
  'gps:nmea': { line: string; port: string }
  'gps:fix-lost': null
  'nbm:sample': { rss: number; unit: string; battery: number; timestamp: number }
  'nbm:battery': number
  'nbm:mode': 'active' | 'standby'
  'device:status': { deviceId: string; status: DeviceStatus; intentional?: boolean }
  'device:error': { deviceId: string; error: AppErrorInfo }
  'scan:state': Record<string, unknown>
  'session:sample': GeoTimestamp
  'session:started': {
    sessionId: string
    startedAt: number
    label: string
    correctionFactor: number | null
    instrument: InstrumentInfo | null
  }
  'session:stopped': SessionSummary
  'session:alert': { message: string }
  alert: { message: string; type: 'error' | 'warning' | 'info'; userAction?: string }
  'tile:preload-progress': PreloadProgress
  'tile:import-progress': { imported: number; skipped: number; total: number }
}

export class EventBus {
  private window: BrowserWindow | null = null

  setWindow(win: BrowserWindow): void {
    this.window = win
  }

  getWindow(): BrowserWindow | null {
    return this.window
  }

  send<K extends keyof EventMap>(channel: K, data: EventMap[K]): void {
    if (this.window && !this.window.webContents.isDestroyed()) {
      this.window.webContents.send(channel, data)
    }
  }

  alert(
    message: string,
    type: 'error' | 'warning' | 'info' = 'info',
    userAction?: string
  ): void {
    this.send('alert', { message, type, userAction })
    AlertLogger.log(message, type)
    if (userAction) {
      AlertLogger.log(`[Acción sugerida] ${userAction}`, type)
    }
  }
}
