import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

export interface PortConfigData {
  nbm550?: string
  gps?: string
}

let CONFIG_PATH: string | null = null

function getConfigPath(): string {
  if (!CONFIG_PATH) {
    CONFIG_PATH = join(app.getPath('userData'), 'port-config.json')
  }
  return CONFIG_PATH
}

export function loadPortConfig(configPath?: string): PortConfigData {
  try {
    const filePath = configPath ?? getConfigPath()
    if (!existsSync(filePath)) return {}
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return {}
  }
}

export function savePortConfig(config: PortConfigData, configPath?: string): void {
  try {
    const filePath = configPath ?? getConfigPath()
    writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
  } catch {
    console.error('No pudo guardarse la configuración de puertos')
  }
}
