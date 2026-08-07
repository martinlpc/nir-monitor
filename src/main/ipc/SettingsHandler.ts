import { join } from 'path'
import { IPC_HANDLERS } from './channels'
import { normalizeProbeName } from '../uncertainty/correctionFactor'
import type { IpcMainLike, AppEnv } from './ipcEnv'
import { sanitizeReThrow } from './ipcEnv'
import type { ProbeRecord } from '../uncertainty/loadBuiltInData'
import type { INBMDriver } from '../../shared/driver-interfaces'
import type { UserAppConfig } from '../../shared/config.types'

export interface ProbeDataServiceLike {
  load(): ProbeRecord[]
  getVersion(): number | null
}

export interface ConfigLike {
  loadAppConfig(): UserAppConfig
  updateAppConfig(partial: Partial<UserAppConfig>): void
}

export interface SettingsHandlerDeps {
  app: AppEnv
  readFile: (path: string) => string
  getNBM: () => INBMDriver | null
  probeDataService: ProbeDataServiceLike
  config: ConfigLike
}

export function matchProbeRecord(records: ProbeRecord[], probeModel: string): ProbeRecord | null {
  const normalized = normalizeProbeName(probeModel)
  return (
    records.find((r) => normalizeProbeName(r.name) === normalized) ??
    records.find((r) => {
      const nr = normalizeProbeName(r.name)
      return normalized.includes(nr) || nr.includes(normalized)
    }) ??
    null
  )
}

export function registerSettingsHandlers(ipc: IpcMainLike, deps: SettingsHandlerDeps): void {
  ipc.handle(IPC_HANDLERS.GET_APP_VERSION, async () => {
    try {
      return { version: deps.app.getVersion() }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipc.handle(IPC_HANDLERS.GET_CHANGELOG, async () => {
    try {
      const changelogPath = deps.app.isPackaged
        ? join(process.resourcesPath, 'CHANGELOG.md')
        : join(deps.app.getAppPath(), 'CHANGELOG.md')
      const content = deps.readFile(changelogPath)
      return { content }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipc.handle(IPC_HANDLERS.GET_BUILT_IN_PROBE_DATA, async () => {
    try {
      const records = deps.probeDataService.load()
      const version = deps.probeDataService.getVersion()
      return { success: true, version, records }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipc.handle(IPC_HANDLERS.GET_PROBE_INFO, async () => {
    try {
      const nbm = deps.getNBM()
      if (!nbm || !nbm.isConnected()) {
        return { success: false, error: 'NBM-550 no conectado' }
      }
      return { success: true, probeInfo: nbm.getProbeInfo() }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipc.handle(IPC_HANDLERS.GET_DEVICE_INFO, async () => {
    try {
      const nbm = deps.getNBM()
      if (!nbm || !nbm.isConnected()) {
        return { success: false, error: 'NBM-550 no conectado' }
      }
      return { success: true, deviceInfo: nbm.getDeviceInfo() }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipc.handle(IPC_HANDLERS.GET_ACTIVE_UNCERTAINTY, async () => {
    try {
      const probeInfo = deps.getNBM()?.getProbeInfo() ?? null
      const probeModel = probeInfo?.model ?? null

      if (!probeModel) {
        return { success: true, factor: null, matchedRecord: null, probeModel }
      }

      const records = deps.probeDataService.load()
      const matched = matchProbeRecord(records, probeModel)

      return {
        success: true,
        factor: matched?.factor ?? null,
        matchedRecord: matched ?? null,
        probeModel
      }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipc.handle(IPC_HANDLERS.GET_SOUNDS_ENABLED, async () => {
    try {
      const appConfig = deps.config.loadAppConfig()
      return { success: true, enabled: appConfig.soundsEnabled ?? true }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipc.handle(IPC_HANDLERS.SET_SOUNDS_ENABLED, async (_event, enabled: boolean) => {
    try {
      deps.config.updateAppConfig({ soundsEnabled: enabled })
      return { success: true }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })
}
