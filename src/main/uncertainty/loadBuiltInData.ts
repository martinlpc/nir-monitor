import { app } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'

export interface ProbeRecord {
  name: string
  fMin: number
  fMax: number
  uncertainty: number
  factor: number
}

interface ProbeDataFile {
  version: number
  records: ProbeRecord[]
}

let loadedRecords: ProbeRecord[] | null = null
let loadedVersion: number | null = null

function getBuiltInPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'probe-data.json')
    : join(app.getAppPath(), 'resources', 'probe-data.json')
}

export function loadBuiltInProbeData(): ProbeRecord[] {
  if (loadedRecords) return loadedRecords
  try {
    const filePath = getBuiltInPath()
    if (!existsSync(filePath)) {
      console.warn('[ProbeData] Built-in probe data not found at:', filePath)
      loadedRecords = []
      return loadedRecords
    }
    const raw = readFileSync(filePath, 'utf-8')
    const parsed: ProbeDataFile = JSON.parse(raw)
    if (!Array.isArray(parsed.records)) {
      console.warn('[ProbeData] Invalid probe data file: missing records array')
      loadedRecords = []
      return loadedRecords
    }
    loadedRecords = parsed.records
    loadedVersion = parsed.version ?? null
    console.log(
      `[ProbeData] Loaded ${loadedRecords.length} probe records (v${loadedVersion ?? '?'}) from ${filePath}`
    )
    return loadedRecords
  } catch (err) {
    console.error('[ProbeData] Error loading built-in probe data:', err)
    loadedRecords = []
    return loadedRecords
  }
}

export function getBuiltInVersion(): number | null {
  return loadedVersion
}
