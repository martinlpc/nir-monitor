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

export class ProbeDataService {
  constructor(
    private readFile: (path: string) => string | null,
    private getProbeDataPath: () => string
  ) {}

  private records: ProbeRecord[] | null = null
  private version: number | null = null

  load(): ProbeRecord[] {
    if (this.records) return this.records
    try {
      const filePath = this.getProbeDataPath()
      const raw = this.readFile(filePath)
      if (raw === null) {
        console.warn('[ProbeData] Built-in probe data not found at:', filePath)
        this.records = []
        return this.records
      }
      const parsed: { version?: number; records: ProbeRecord[] } = JSON.parse(raw)
      if (!Array.isArray(parsed.records)) {
        console.warn('[ProbeData] Invalid probe data file: missing records array')
        this.records = []
        return this.records
      }
      this.records = parsed.records
      this.version = parsed.version ?? null
      console.log(
        `[ProbeData] Loaded ${this.records.length} probe records (v${this.version ?? '?'}) from ${filePath}`
      )
      return this.records
    } catch (err) {
      console.error('[ProbeData] Error loading built-in probe data:', err)
      this.records = []
      return this.records
    }
  }

  getVersion(): number | null {
    this.load()
    return this.version
  }
}

function getBuiltInPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'probe-data.json')
    : join(app.getAppPath(), 'resources', 'probe-data.json')
}

export function createDefaultProbeDataService(): ProbeDataService {
  return new ProbeDataService(
    (path) => {
      if (!existsSync(path)) return null
      return readFileSync(path, 'utf-8')
    },
    () => getBuiltInPath()
  )
}
