import { app } from 'electron'
import { join, dirname } from 'path'
import { mkdir, writeFile, readFile, stat, rm, readdir } from 'fs/promises'
import { EventEmitter } from 'events'
import type { TileProvider } from '../../shared/tileProviders'
import { getProvider, buildOriginUrl } from '../../shared/tileProviders'
import { getTileRange, estimateTileCount } from './tileMath'

const CACHE_ROOT = 'tile-cache'
const PRELOAD_CONCURRENCY = 8

export interface CacheStats {
  sizeBytes: number
  tileCount: number
}

export interface PreloadProgress {
  current: number
  total: number
  zoom: number
  phase: 'counting' | 'downloading' | 'done' | 'cancelled' | 'error'
  error?: string
}

export class TileCacheService extends EventEmitter {
  private basePath: string
  private preloadAbort = false

  constructor() {
    super()
    this.basePath = join(app.getPath('userData'), CACHE_ROOT)
  }

  async ensureBaseDir(): Promise<void> {
    await mkdir(this.basePath, { recursive: true })
  }

  getBasePath(): string {
    return this.basePath
  }

  tilePath(providerId: string, z: number, x: number, y: number): string {
    return join(this.basePath, providerId, String(z), String(x), `${y}.png`)
  }

  async hasTile(providerId: string, z: number, x: number, y: number): Promise<boolean> {
    try {
      await stat(this.tilePath(providerId, z, x, y))
      return true
    } catch {
      return false
    }
  }

  async getTile(
    providerId: string,
    z: number,
    x: number,
    y: number
  ): Promise<Buffer | null> {
    try {
      return await readFile(this.tilePath(providerId, z, x, y))
    } catch {
      return null
    }
  }

  async setTile(
    providerId: string,
    z: number,
    x: number,
    y: number,
    data: Buffer
  ): Promise<void> {
    const fp = this.tilePath(providerId, z, x, y)
    await mkdir(dirname(fp), { recursive: true })
    await writeFile(fp, data)
  }

  async fetchAndCache(
    provider: TileProvider,
    z: number,
    x: number,
    y: number
  ): Promise<Buffer> {
    const cached = await this.getTile(provider.id, z, x, y)
    if (cached) return cached

    const url = buildOriginUrl(provider, z, x, y)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Tile fetch failed: ${url} (${response.status})`)
    }
    const data = Buffer.from(await response.arrayBuffer())
    await this.setTile(provider.id, z, x, y, data)
    return data
  }

  async getStats(): Promise<CacheStats> {
    let tileCount = 0
    let sizeBytes = 0

    const walk = async (dir: string): Promise<void> => {
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const fp = join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(fp)
        } else if (entry.name.endsWith('.png')) {
          tileCount++
          try {
            const s = await stat(fp)
            sizeBytes += s.size
          } catch {
            // skip
          }
        }
      }
    }

    await walk(this.basePath)
    return { tileCount, sizeBytes }
  }

  async clearCache(): Promise<void> {
    try {
      await rm(this.basePath, { recursive: true, force: true })
    } catch {
      // already gone
    }
    await this.ensureBaseDir()
  }

  async importFromPath(
    sourcePath: string,
    providerId: string,
    onProgress?: (imported: number, skipped: number, total: number) => void
  ): Promise<{ imported: number; skipped: number }> {
    const { default: AdmZip } = await import('adm-zip')

    let imported = 0
    let skipped = 0
    let total = 0
    const entries: { z: number; x: number; y: number; data: Buffer }[] = []

    if (sourcePath.endsWith('.zip')) {
      const zip = new AdmZip(sourcePath)
      const zipEntries = zip.getEntries()
      total = zipEntries.length

      for (const entry of zipEntries) {
        if (entry.isDirectory) continue
        const parts = entry.entryName.replace(/\\/g, '/').split('/')
        if (parts.length < 3) continue
        const z = parseInt(parts[parts.length - 3], 10)
        const x = parseInt(parts[parts.length - 2], 10)
        const y = parseInt(parts[parts.length - 1].replace('.png', ''), 10)
        if (isNaN(z) || isNaN(x) || isNaN(y)) continue
        entries.push({ z, x, y, data: entry.getData() })
      }
    } else {
      const scanDir = async (dir: string): Promise<void> => {
        let items
        try {
          items = await readdir(dir)
        } catch {
          return
        }
        for (const item of items) {
          const fp = join(dir, item)
          let s
          try {
            s = await stat(fp)
          } catch {
            continue
          }
          if (s.isDirectory()) {
            await scanDir(fp)
          } else if (item.endsWith('.png')) {
            const rel = fp.replace(sourcePath, '').replace(/^[/\\]/, '')
            const parts = rel.replace(/\\/g, '/').split('/')
            if (parts.length < 3) continue
            const z = parseInt(parts[parts.length - 3], 10)
            const x = parseInt(parts[parts.length - 2], 10)
            const y = parseInt(item.replace('.png', ''), 10)
            if (isNaN(z) || isNaN(x) || isNaN(y)) continue
            const data = await readFile(fp)
            entries.push({ z, x, y, data })
          }
        }
      }
      await scanDir(sourcePath)
      total = entries.length
    }

    for (const entry of entries) {
      const existing = await this.hasTile(providerId, entry.z, entry.x, entry.y)
      if (existing) {
        skipped++
      } else {
        await this.setTile(providerId, entry.z, entry.x, entry.y, entry.data)
        imported++
      }
      onProgress?.(imported, skipped, total)
    }

    return { imported, skipped }
  }

  async preloadTiles(
    providerId: string,
    north: number,
    south: number,
    east: number,
    west: number,
    minZoom: number,
    maxZoom: number
  ): Promise<void> {
    this.preloadAbort = false
    const provider = getProvider(providerId)
    if (!provider) throw new Error(`Unknown provider: ${providerId}`)

    const total = estimateTileCount(north, south, east, west, minZoom, maxZoom)
    let current = 0

    const emitProgress = (phase: PreloadProgress['phase']): void => {
      this.emit('preload-progress', { current, total, zoom: minZoom, phase } as PreloadProgress)
    }

    emitProgress('counting')

    for (let z = minZoom; z <= maxZoom; z++) {
      if (this.preloadAbort) {
        emitProgress('cancelled')
        return
      }

      const range = getTileRange(north, south, east, west, z)
      const tiles: { x: number; y: number }[] = []

      for (let x = range.minX; x <= range.maxX; x++) {
        for (let y = range.minY; y <= range.maxY; y++) {
          tiles.push({ x, y })
        }
      }

      for (let i = 0; i < tiles.length; i += PRELOAD_CONCURRENCY) {
        if (this.preloadAbort) {
          emitProgress('cancelled')
          return
        }

        const batch = tiles.slice(i, i + PRELOAD_CONCURRENCY)
        await Promise.allSettled(
          batch.map(({ x, y }) => this.fetchAndCache(provider, z, x, y).catch(() => {}))
        )

        current += batch.length
        this.emit('preload-progress', {
          current,
          total,
          zoom: z,
          phase: 'downloading'
        } as PreloadProgress)
      }
    }

    emitProgress('done')
  }

  cancelPreload(): void {
    this.preloadAbort = true
  }

  async importTiles(
    sourcePath: string,
    providerId: string,
    onProgress?: (imported: number, skipped: number, total: number) => void
  ): Promise<{ imported: number; skipped: number }> {
    return this.importFromPath(sourcePath, providerId, onProgress)
  }
}
