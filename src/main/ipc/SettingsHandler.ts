import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { IPC_HANDLERS } from './channels'
import type { UncertaintyRecord, UncertaintyData } from '../../shared/ipc.types'
import type { DeviceManager } from '../services/DeviceManager'
import { loadAppConfig, updateAppConfig } from '../services/AppConfig'

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

async function parseUncertaintyFile(filePath: string): Promise<UncertaintyFileResult> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)

    if (lines.length === 0) {
      return { success: false, error: 'El archivo está vacío' }
    }

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
}

// Auto-cargar archivo de incertidumbres desde la configuración persistida
async function autoLoadUncertaintyFile(): Promise<void> {
  const config = loadAppConfig()
  console.log(
    '[Settings] Auto-load check, uncertaintyFilePath:',
    config.uncertaintyFilePath ?? '(no guardado)'
  )
  if (!config.uncertaintyFilePath) return

  if (!existsSync(config.uncertaintyFilePath)) {
    console.warn(
      '[Settings] Archivo de incertidumbres guardado no existe:',
      config.uncertaintyFilePath
    )
    return
  }

  const result = await parseUncertaintyFile(config.uncertaintyFilePath)
  if (result.success) {
    console.log(
      '[Settings] ✓ Archivo de incertidumbres cargado automáticamente:',
      config.uncertaintyFilePath
    )
  } else {
    console.warn('[Settings] Error al cargar archivo de incertidumbres:', result.error)
  }
}

export function registerSettingsHandlers(
  window: BrowserWindow,
  deviceManager: DeviceManager
): void {
  // Auto-cargar al iniciar
  autoLoadUncertaintyFile()

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
    const parsed = await parseUncertaintyFile(filePath)

    if (parsed.success) {
      console.log('[Settings] Persistiendo ruta del archivo:', filePath)
      updateAppConfig({ uncertaintyFilePath: filePath })
    }

    return parsed
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

    const normalize = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const normalizedProbe = normalize(probeModel)
    const matched =
      loadedUncertainty.records.find((r) => normalize(r.name) === normalizedProbe) ??
      loadedUncertainty.records.find(
        (r) =>
          normalizedProbe.includes(normalize(r.name)) || normalize(r.name).includes(normalizedProbe)
      )

    return {
      success: true,
      factor: matched?.factor ?? null,
      matchedRecord: matched ?? null,
      probeModel
    }
  })

  ipcMain.handle(IPC_HANDLERS.GET_LOADED_UNCERTAINTY, async (): Promise<UncertaintyFileResult> => {
    if (!loadedUncertainty) {
      return { success: false }
    }
    return {
      success: true,
      filePath: loadedUncertainty.filePath,
      headers: loadedUncertainty.headers,
      records: loadedUncertainty.records
    }
  })
}
