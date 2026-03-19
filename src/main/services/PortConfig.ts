import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

export interface PortConfigData {
  nbm550?: string
  gps?: string
}

const CONFIG_PATH = join(app.getPath('userData'), 'port-config.json')

export function loadPortConfig(): PortConfigData {
  try {
    if (!existsSync(CONFIG_PATH)) return {}
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

export function savePortConfig(config: PortConfigData): void {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
  } catch {
    console.error('No pudo guardarse la configuración de puertos')
  }
}
