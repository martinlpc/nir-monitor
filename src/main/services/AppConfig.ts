import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

export interface AppConfigData {
  ports?: {
    nbm550?: string
    gps?: string
  }
  uncertaintyFilePath?: string
}

let CONFIG_PATH: string | null = null

function getConfigPath(): string {
  if (!CONFIG_PATH) {
    CONFIG_PATH = join(app.getPath('userData'), 'app-config.json')
  }
  return CONFIG_PATH
}

export function loadAppConfig(): AppConfigData {
  try {
    const filePath = getConfigPath()
    if (!existsSync(filePath)) return {}
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return {}
  }
}

export function saveAppConfig(config: AppConfigData): void {
  try {
    const filePath = getConfigPath()
    writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
    console.log('[AppConfig] ✓ Configuración guardada en:', filePath)
  } catch (err) {
    console.error('[AppConfig] No pudo guardarse la configuración:', err)
  }
}

export function updateAppConfig(partial: Partial<AppConfigData>): void {
  const current = loadAppConfig()
  saveAppConfig({ ...current, ...partial })
}
