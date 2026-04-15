import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile } from 'fs/promises'
import { IPC_HANDLERS } from './channels'
import type { UncertaintyRecord, UncertaintyData } from '../../shared/ipc.types'
import type { DeviceManager } from '../services/DeviceManager'

export interface UncertaintyFileResult {
  success: boolean
  filePath?: string
  headers?: string[]
  records?: UncertaintyRecord[]
  error?: string
  canceled?: boolean
}

// Estado global de la incertidumbre cargada (accesible desde otros módulos)
let loadedUncertainty: UncertaintyData | null = null

export function getLoadedUncertainty(): UncertaintyData | null {
  return loadedUncertainty
}

export function registerSettingsHandlers(
  window: BrowserWindow,
  deviceManager: DeviceManager
): void {
  ipcMain.handle(IPC_HANDLERS.OPEN_UNCERTAINTY_FILE, async (): Promise<UncertaintyFileResult> => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Cargar archivo de incertidumbres',
      filters: [
        { name: 'Archivos de texto', extensions: ['txt', 'csv', 'tsv'] },
        { name: 'Todos los archivos', extensions: ['*'] }
      ],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    const filePath = result.filePaths[0]

    try {
      const content = await readFile(filePath, 'utf-8')
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)

      if (lines.length === 0) {
        return { success: false, error: 'El archivo está vacío' }
      }

      // Detectar separador (tab o ;)
      const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','
      const headers = lines[0].split(sep).map((h) => h.trim())

      const records: UncertaintyRecord[] = lines.slice(1).map((line) => {
        const cols = line.split(sep).map((c) => c.trim())
        return {
          name: cols[0] || '',
          fMin: parseFloat(cols[1]) || 0,
          fMax: parseFloat(cols[2]) || 0,
          uncertainty: parseFloat(cols[3]) || 0,
          factor: parseFloat(cols[4]) || 1
        }
      })

      loadedUncertainty = { filePath, headers, records }
      return { success: true, filePath, headers, records }
    } catch (err) {
      return {
        success: false,
        error: `Error leyendo archivo: ${err instanceof Error ? err.message : 'desconocido'}`
      }
    }
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

    if (!loadedUncertainty || !probeModel) {
      return { success: true, factor: null, matchedRecord: null, probeModel }
    }

    const matched = loadedUncertainty.records.find(
      (r) => r.name.toUpperCase() === probeModel.toUpperCase()
    )

    return {
      success: true,
      factor: matched?.factor ?? null,
      matchedRecord: matched ?? null,
      probeModel
    }
  })
}
