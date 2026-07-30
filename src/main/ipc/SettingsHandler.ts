import { ipcMain, app } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { IPC_HANDLERS } from './channels'
import { toUserError } from '../../shared/errors/toUserError'
import { normalizeProbeName } from '../uncertainty/correctionFactor'
import { ConfigService } from '../services/ConfigService'
import type { ProbeDataService } from '../uncertainty/loadBuiltInData'
import type { DeviceManager } from '../services/DeviceManager'

function sanitizeReThrow(err: unknown): never {
  const { message, technical } = toUserError(err)
  console.error(`[IPC] ${technical}`)
  throw new Error(message)
}

export function registerSettingsHandlers(
  deviceManager: DeviceManager,
  probeDataService: ProbeDataService
): void {
  ipcMain.handle(IPC_HANDLERS.GET_APP_VERSION, async () => {
    try {
      return { version: app.getVersion() }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipcMain.handle(IPC_HANDLERS.GET_CHANGELOG, async () => {
    try {
      const changelogPath = app.isPackaged
        ? join(process.resourcesPath, 'CHANGELOG.md')
        : join(app.getAppPath(), 'CHANGELOG.md')
      const content = readFileSync(changelogPath, 'utf-8')
      return { content }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipcMain.handle(IPC_HANDLERS.GET_BUILT_IN_PROBE_DATA, async () => {
    try {
      const records = probeDataService.load()
      const version = probeDataService.getVersion()
      return { success: true, version, records }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipcMain.handle(IPC_HANDLERS.GET_PROBE_INFO, async () => {
    try {
      const nbm = deviceManager.getNBM()
      if (!nbm || !nbm.isConnected()) {
        return { success: false, error: 'NBM-550 no conectado' }
      }
      const probeInfo = nbm.getProbeInfo()
      return { success: true, probeInfo }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipcMain.handle(IPC_HANDLERS.GET_DEVICE_INFO, async () => {
    try {
      const nbm = deviceManager.getNBM()
      if (!nbm || !nbm.isConnected()) {
        return { success: false, error: 'NBM-550 no conectado' }
      }
      const deviceInfo = nbm.getDeviceInfo()
      return { success: true, deviceInfo }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipcMain.handle(IPC_HANDLERS.GET_ACTIVE_UNCERTAINTY, async () => {
    try {
      const nbm = deviceManager.getNBM()
      const probeInfo = nbm?.getProbeInfo() ?? null
      const probeModel = probeInfo?.model ?? null

      if (!probeModel) {
        return { success: true, factor: null, matchedRecord: null, probeModel }
      }

      const records = probeDataService.load()
      const normalizedProbe = normalizeProbeName(probeModel)
      const matched =
        records.find((r) => normalizeProbeName(r.name) === normalizedProbe) ??
        records.find(
          (r) =>
            normalizedProbe.includes(normalizeProbeName(r.name)) ||
            normalizeProbeName(r.name).includes(normalizedProbe)
        )

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

  ipcMain.handle(IPC_HANDLERS.GET_SOUNDS_ENABLED, async () => {
    try {
      const config = new ConfigService()
      const appConfig = config.loadAppConfig()
      return { success: true, enabled: appConfig.soundsEnabled ?? true }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipcMain.handle(IPC_HANDLERS.SET_SOUNDS_ENABLED, async (_, enabled: boolean) => {
    try {
      const config = new ConfigService()
      config.updateAppConfig({ soundsEnabled: enabled })
      return { success: true }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })
}
