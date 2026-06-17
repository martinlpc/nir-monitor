import { ipcMain } from 'electron'
import { IPC_HANDLERS } from './channels'
import { loadBuiltInProbeData, getBuiltInVersion } from '../uncertainty/loadBuiltInData'
import { normalizeProbeName } from '../uncertainty/correctionFactor'
import type { DeviceManager } from '../services/DeviceManager'

export function registerSettingsHandlers(deviceManager: DeviceManager): void {
  ipcMain.handle(IPC_HANDLERS.GET_BUILT_IN_PROBE_DATA, async () => {
    const records = loadBuiltInProbeData()
    const version = getBuiltInVersion()
    return { success: true, version, records }
  })
  ipcMain.handle(IPC_HANDLERS.GET_PROBE_INFO, async () => {
    const nbm = deviceManager.getNBM()
    if (!nbm || !nbm.isConnected()) {
      return { success: false, error: 'NBM-550 no conectado' }
    }
    const probeInfo = nbm.getProbeInfo()
    return { success: true, probeInfo }
  })

  ipcMain.handle(IPC_HANDLERS.GET_ACTIVE_UNCERTAINTY, async () => {
    const nbm = deviceManager.getNBM()
    const probeInfo = nbm?.getProbeInfo() ?? null
    const probeModel = probeInfo?.model ?? null

    if (!probeModel) {
      return { success: true, factor: null, matchedRecord: null, probeModel }
    }

    const records = loadBuiltInProbeData()
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
  })
}
