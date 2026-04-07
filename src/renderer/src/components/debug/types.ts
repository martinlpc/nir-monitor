import type { DeviceManagerStateDTO } from '../../../../shared/dto'
import type { GeoTimestamp } from '../../../../shared/GeoTimestamp'
import type { SessionSummary } from '../../../../shared/ipc.types'

export type PortInfo = { path: string; manufacturer: string }
export type DeviceId = 'nbm550' | 'gps'
export type TriggerMode = 'distance' | 'time'

export interface LogEntry {
  id: number
  timestamp: string
  type: string
  message: string
}

export interface NmeaEntry {
  id: number
  timestamp: string
  port: string
  line: string
}

export interface DebugPanelState {
  ports: PortInfo[]
  deviceState: DeviceManagerStateDTO
  selectedPorts: Record<DeviceId, string>
  sessionLabel: string
  triggerMode: TriggerMode
  minDistanceMeters: string
  intervalMs: string
  sessionId: string | null
  sessionSummary: SessionSummary | null
  lastSample: GeoTimestamp | null
  gpsFix: boolean
  gpsText: string
  nmeaLines: NmeaEntry[]
  busyAction: string | null
  logs: LogEntry[]
}
