import type { BrowserWindow } from 'electron'
import { IPC_EVENTS } from '../../shared/ipc-channels'
import type { DeviceStatus } from '../../shared/device.types'
import type { GeoPosition, GeoTimestamp } from '../../shared/GeoTimestamp'
import type { SessionSummary, InstrumentInfo } from '../../shared/ipc.types'
import type { AppErrorInfo } from '../../shared/errors/error.types'
import type { PreloadProgress } from '../../shared/tile.types'
import type { AlertLogger } from '../infrastructure/AlertLogger'

/** Canales IPC (push) posibles — fuente de verdad única en `IPC_EVENTS`. */
export type EventChannel = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS]

/** Tipos de payload por canal, alineados con `IPC_EVENTS`. */
export interface EventPayloads {
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

// Verificación en tiempo de compilación: las claves de EventPayloads deben
// coincidir con todos los canales definidos en IPC_EVENTS.
type ChannelsInPayloads = keyof EventPayloads
export type AssertChannelsSynchronized = Exclude<EventChannel, ChannelsInPayloads> extends never
  ? Exclude<ChannelsInPayloads, EventChannel> extends never
    ? true
    : 'EventPayloads has channels not in IPC_EVENTS'
  : 'IPC_EVENTS has channels missing from EventPayloads'

export type EventMap = EventPayloads

export class EventBus {
  private window: BrowserWindow | null = null
  private readonly alertLogger: AlertLogger

  constructor(alertLogger: AlertLogger) {
    this.alertLogger = alertLogger
  }

  setWindow(win: BrowserWindow): void {
    this.window = win
  }

  getWindow(): BrowserWindow | null {
    return this.window
  }

  send<K extends EventChannel>(channel: K, data: EventPayloads[K]): void {
    if (this.window && !this.window.webContents.isDestroyed()) {
      this.window.webContents.send(channel, data)
    }
  }

  alert(message: string, type: 'error' | 'warning' | 'info' = 'info', userAction?: string): void {
    this.send('alert', { message, type, userAction })
    this.alertLogger.log(message, type)
    if (userAction) {
      this.alertLogger.log(`[Acción sugerida] ${userAction}`, type)
    }
  }
}
