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
import {
  DEFAULT_NBM_DRIVER,
  DEFAULT_GPS_DRIVER,
  DEFAULT_NBM_POLLING,
  DEFAULT_NBM_TIMEOUTS,
  DEFAULT_SERIAL_PROBE,
  DEFAULT_NBM_RECONNECT,
  DEFAULT_GPS_RECONNECT,
  DEFAULT_FLUSH,
  DEFAULT_GEO_FUSION
} from '../../shared/config.constants'

export interface PortConfigData {
  nbm550?: string
  gps?: string
}

export class ConfigService {
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

  loadPortConfig(): PortConfigData {
    try {
      if (!existsSync(this.portConfigPath)) return {}
      return JSON.parse(readFileSync(this.portConfigPath, 'utf-8')) as PortConfigData
    } catch {
      return {}
    }
  }

  savePortConfig(config: PortConfigData): void {
    try {
      writeFileSync(this.portConfigPath, JSON.stringify(config, null, 2), 'utf-8')
    } catch {
      console.error('[ConfigService] No pudo guardarse la configuración de puertos')
    }
  }

  // ── Config accessors ───────────────────────────────────

  get nbmPollIntervalMs(): number {
    return this.simulationMode ? 5000 : DEFAULT_NBM_POLLING.activePollIntervalMs
  }

  get nbmDriverConfig(): NbmDriverConfig {
    return { ...DEFAULT_NBM_DRIVER }
  }

  get gpsDriverConfig(): GpsDriverConfig {
    return { ...DEFAULT_GPS_DRIVER }
  }

  get nbmPollingConfig(): NbmPollingConfig {
    return { ...DEFAULT_NBM_POLLING }
  }

  get nbmTimeouts(): NbmDriverTimeouts {
    return { ...DEFAULT_NBM_TIMEOUTS }
  }

  get serialProbeConfig(): SerialProbeConfig {
    return { ...DEFAULT_SERIAL_PROBE }
  }

  get nbmReconnectConfig(): ReconnectConfig {
    return { ...DEFAULT_NBM_RECONNECT }
  }

  get gpsReconnectConfig(): ReconnectConfig {
    return { ...DEFAULT_GPS_RECONNECT }
  }

  get flushConfig(): FlushConfig {
    return { ...DEFAULT_FLUSH }
  }

  get geoFusionConfig(): GeoFusionConfigOptions {
    return { ...DEFAULT_GEO_FUSION }
  }
}
