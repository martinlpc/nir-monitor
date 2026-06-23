import { join } from 'path'
import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type {
  NbmDriverConfig,
  GpsDriverConfig,
  NbmPollingConfig,
  NbmDriverTimeouts,
  ReconnectConfig,
  SerialProbeConfig,
  FlushConfig,
  GeoFusionConfigOptions,
  UserAppConfig
} from '../../shared/config.types'

export class ConfigService {
  // ── Baud rates (single source of truth) ────────────────
  static readonly NBM_BAUD_RATE = 460800
  static readonly GPS_BAUD_RATE = 4800

  // ── Defaults ───────────────────────────────────────────

  static readonly DEFAULT_NBM_DRIVER: NbmDriverConfig = {
    baudRate: ConfigService.NBM_BAUD_RATE,
    pollIntervalMs: 200,
    unit: 'V/m'
  }

  static readonly DEFAULT_GPS_DRIVER: GpsDriverConfig = {
    baudRate: ConfigService.GPS_BAUD_RATE
  }

  static readonly DEFAULT_NBM_POLLING: NbmPollingConfig = {
    activePollIntervalMs: 200,
    standbyBatteryIntervalMs: 30_000,
    maxConsecutiveReadFailures: 8
  }

  static readonly DEFAULT_NBM_TIMEOUTS: NbmDriverTimeouts = {
    responseTimeoutMs: 6000,
    initDelayMs: 2000,
    maxConsecutiveTimeouts: 4
  }

  static readonly DEFAULT_SERIAL_PROBE: SerialProbeConfig = {
    nbmTimeoutMs: 6000,
    nmeaListenMs: 12000
  }

  static readonly DEFAULT_NBM_RECONNECT: ReconnectConfig = {
    intervalMs: 3000,
    timeoutMs: 30000
  }

  static readonly DEFAULT_GPS_RECONNECT: ReconnectConfig = {
    intervalMs: 3000,
    timeoutMs: 30000
  }

  static readonly DEFAULT_FLUSH: FlushConfig = {
    everyNPoints: 5,
    intervalMs: 5_000
  }

  static readonly DEFAULT_GEO_FUSION: GeoFusionConfigOptions = {
    triggerMode: 'distance',
    minDistanceMeters: 20,
    intervalMs: 5000,
    testMode: false
  }

  // ── Instance state ─────────────────────────────────────

  readonly simulationMode: boolean
  readonly debugMode: boolean

  private appConfigPath: string
  private portConfigPath: string
  private appConfigCache: UserAppConfig | null = null

  constructor(options?: { appConfigPath?: string; portConfigPath?: string }) {
    this.simulationMode =
      process.env.NIR_SIMULATION === 'true' || process.argv.includes('--simulation')
    this.debugMode = process.env['NIR_APP_MODE'] === 'debug'

    if (options?.appConfigPath && options?.portConfigPath) {
      this.appConfigPath = options.appConfigPath
      this.portConfigPath = options.portConfigPath
    } else {
      const userData = this.getUserDataPath()
      this.appConfigPath = join(userData, 'app-config.json')
      this.portConfigPath = join(userData, 'port-config.json')
    }
  }

  private getUserDataPath(): string {
    try {
      return app.getPath('userData')
    } catch {
      return process.cwd()
    }
  }

  // ── App config (user-facing settings) ──────────────────

  loadAppConfig(): UserAppConfig {
    if (this.appConfigCache) return this.appConfigCache
    try {
      if (!existsSync(this.appConfigPath)) {
        this.appConfigCache = {}
        return this.appConfigCache
      }
      this.appConfigCache = JSON.parse(readFileSync(this.appConfigPath, 'utf-8')) as UserAppConfig
      return this.appConfigCache
    } catch {
      this.appConfigCache = {}
      return this.appConfigCache
    }
  }

  saveAppConfig(config: UserAppConfig): void {
    try {
      writeFileSync(this.appConfigPath, JSON.stringify(config, null, 2), 'utf-8')
      this.appConfigCache = config
    } catch (err) {
      console.error('[ConfigService] No pudo guardarse la configuración:', err)
    }
  }

  updateAppConfig(partial: Partial<UserAppConfig>): void {
    const current = this.loadAppConfig()
    this.saveAppConfig({ ...current, ...partial })
  }

  // ── Port config (persisted port assignments) ───────────

  loadPortConfig(): { nbm550?: string; gps?: string } {
    try {
      if (!existsSync(this.portConfigPath)) return {}
      return JSON.parse(readFileSync(this.portConfigPath, 'utf-8'))
    } catch {
      return {}
    }
  }

  savePortConfig(config: { nbm550?: string; gps?: string }): void {
    try {
      writeFileSync(this.portConfigPath, JSON.stringify(config, null, 2), 'utf-8')
    } catch {
      console.error('[ConfigService] No pudo guardarse la configuración de puertos')
    }
  }

  // ── Config accessors ───────────────────────────────────

  get nbmPollIntervalMs(): number {
    return this.simulationMode ? 5000 : ConfigService.DEFAULT_NBM_POLLING.activePollIntervalMs
  }

  get nbmDriverConfig(): NbmDriverConfig {
    return { ...ConfigService.DEFAULT_NBM_DRIVER }
  }

  get gpsDriverConfig(): GpsDriverConfig {
    return { ...ConfigService.DEFAULT_GPS_DRIVER }
  }

  get nbmPollingConfig(): NbmPollingConfig {
    return { ...ConfigService.DEFAULT_NBM_POLLING }
  }

  get nbmTimeouts(): NbmDriverTimeouts {
    return { ...ConfigService.DEFAULT_NBM_TIMEOUTS }
  }

  get serialProbeConfig(): SerialProbeConfig {
    return { ...ConfigService.DEFAULT_SERIAL_PROBE }
  }

  get nbmReconnectConfig(): ReconnectConfig {
    return { ...ConfigService.DEFAULT_NBM_RECONNECT }
  }

  get gpsReconnectConfig(): ReconnectConfig {
    return { ...ConfigService.DEFAULT_GPS_RECONNECT }
  }

  get flushConfig(): FlushConfig {
    return { ...ConfigService.DEFAULT_FLUSH }
  }

  get geoFusionConfig(): GeoFusionConfigOptions {
    return { ...ConfigService.DEFAULT_GEO_FUSION }
  }
}
