import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile } from 'fs/promises'
import { IPC_HANDLERS } from './channels'

export interface UncertaintyRecord {
  frequency: string
  value: number
  unit: string
  [key: string]: string | number
}

export interface UncertaintyFileResult {
  success: boolean
  filePath?: string
  headers?: string[]
  records?: UncertaintyRecord[]
  error?: string
  canceled?: boolean
}

export function registerSettingsHandlers(window: BrowserWindow): void {
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
        const record: UncertaintyRecord = {
          frequency: cols[0] || '',
          value: parseFloat(cols[1]) || 0,
          unit: cols[2] || ''
        }
        // Campos adicionales
        headers.forEach((h, i) => {
          if (i >= 3 && cols[i] !== undefined) {
            const num = parseFloat(cols[i])
            record[h] = isNaN(num) ? cols[i] : num
          }
        })
        return record
      })

      return { success: true, filePath, headers, records }
    } catch (err) {
      return {
        success: false,
        error: `Error leyendo archivo: ${err instanceof Error ? err.message : 'desconocido'}`
      }
    }
  })
}
