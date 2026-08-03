import { dirname } from 'path'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { Mock } from 'vitest'
import { TileCacheService } from './TileCacheService'
import type { TileProvider } from '../../shared/tileProviders'
import type { TileFs } from './TileCacheService'

interface FsNode {
  kind: 'dir' | 'file'
  data?: Buffer
}

interface MockDirEntry {
  name: string | undefined
  isDirectory: () => boolean
}

interface MockTileFs {
  nodes: Map<string, FsNode>
  addFile: (filePath: string, data: Buffer) => void
  mkdir: Mock<(dir: string) => Promise<void>>
  writeFile: Mock<(filePath: string, data: Buffer) => Promise<void>>
  readFile: Mock<(filePath: string) => Promise<Buffer>>
  stat: Mock<(filePath: string) => Promise<{ size: number; isDirectory: () => boolean }>>
  rm: Mock<() => Promise<void>>
  readdir: Mock<
    (
      dir: string,
      opts?: { withFileTypes?: boolean }
    ) => Promise<(string | undefined)[] | MockDirEntry[]>
  >
}

function createMockTileFs(basePath: string): MockTileFs {
  const norm = (p: string): string => p.replace(/\\/g, '/')
  const nodes = new Map<string, FsNode>()
  nodes.set(norm(basePath), { kind: 'dir' })

  const addDirPath = (dir: string): void => {
    const parts = norm(dir).split('/').filter(Boolean)
    let cur = ''
    for (const part of parts) {
      cur += '/' + part
      if (!nodes.has(cur)) nodes.set(cur, { kind: 'dir' })
    }
  }

  const addFile = (filePath: string, data: Buffer): void => {
    const normalized = norm(filePath)
    addDirPath(dirname(normalized))
    nodes.set(normalized, { kind: 'file', data })
  }

  const childrenOf = (dir: string): string[] => {
    const prefix = norm(dir).replace(/\/$/, '')
    return [...nodes.keys()].filter((p) => {
      if (!p.startsWith(prefix + '/')) return false
      return p.slice(prefix.length + 1).split('/').length === 1
    })
  }

  return {
    nodes,
    addFile,
    mkdir: vi.fn(async (dir: string) => addDirPath(dir)),
    writeFile: vi.fn(async (filePath: string, data: Buffer) => addFile(filePath, data)),
    readFile: vi.fn(async (filePath: string) => {
      const node = nodes.get(norm(filePath))
      if (!node || node.kind !== 'file') throw new Error('ENOENT')
      return node.data!
    }),
    stat: vi.fn(async (filePath: string) => {
      const node = nodes.get(norm(filePath))
      if (!node) throw new Error('ENOENT')
      return {
        size: node.kind === 'file' ? node.data!.length : 0,
        isDirectory: () => node.kind === 'dir'
      }
    }),
    rm: vi.fn(async () => {
      nodes.clear()
      nodes.set(norm(basePath), { kind: 'dir' })
    }),
    readdir: vi.fn(async (dir: string, opts?: { withFileTypes?: boolean }) => {
      const children = childrenOf(dir)
      if (opts?.withFileTypes) {
        return children.map((p) => ({
          name: p.split('/').pop(),
          isDirectory: () => nodes.get(p)!.kind === 'dir'
        }))
      }
      return children.map((p) => p.split('/').pop())
    })
  }
}

const BASE_PATH = '/cache'
const TEST_PROVIDER: TileProvider = {
  id: 'test',
  name: 'Test',
  url: 'https://test.example/{z}/{x}/{y}.png',
  attribution: 'Test attribution'
}

describe('TileCacheService', () => {
  let mockFs: ReturnType<typeof createMockTileFs>
  let fetchFn: Mock<(url: string) => Promise<Response>>
  let service: TileCacheService

  function okResponse(): Response {
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
  }

  beforeEach(() => {
    mockFs = createMockTileFs(BASE_PATH)
    fetchFn = vi.fn(async () => okResponse())
    service = new TileCacheService({
      basePath: BASE_PATH,
      fs: mockFs as unknown as TileFs,
      fetchFn
    })
  })

  it('ensureBaseDir creates the base directory', async () => {
    await service.ensureBaseDir()
    expect(mockFs.mkdir).toHaveBeenCalledWith(BASE_PATH, { recursive: true })
  })

  it('tilePath builds provider/z/x/y.png layout', () => {
    expect(service.tilePath('osm', 3, 4, 5)).toMatch(/osm[/\\]3[/\\]4[/\\]5\.png$/)
  })

  it('hasTile returns false for missing tile and true after setTile', async () => {
    expect(await service.hasTile('osm', 1, 2, 3)).toBe(false)
    await service.setTile('osm', 1, 2, 3, Buffer.from('tile'))
    expect(await service.hasTile('osm', 1, 2, 3)).toBe(true)
  })

  it('getTile returns null for missing tile and the buffer for existing', async () => {
    expect(await service.getTile('osm', 1, 2, 3)).toBeNull()
    await service.setTile('osm', 1, 2, 3, Buffer.from('tile-data'))
    expect((await service.getTile('osm', 1, 2, 3))?.toString()).toBe('tile-data')
  })

  it('setTile creates parent directories before writing', async () => {
    await service.setTile('osm', 1, 2, 3, Buffer.from('tile'))
    expect(mockFs.mkdir).toHaveBeenCalled()
    expect(mockFs.writeFile).toHaveBeenCalledTimes(1)
  })

  it('fetchAndCache fetches, stores and reuses cached tile', async () => {
    const first = await service.fetchAndCache(TEST_PROVIDER, 1, 2, 3)
    expect(first).toEqual(Buffer.from([1, 2, 3]))
    expect(fetchFn).toHaveBeenCalledTimes(1)

    const second = await service.fetchAndCache(TEST_PROVIDER, 1, 2, 3)
    expect(second).toEqual(Buffer.from([1, 2, 3]))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('fetchAndCache throws when origin responds with error', async () => {
    fetchFn.mockResolvedValueOnce(new Response('error', { status: 404 }))
    await expect(service.fetchAndCache(TEST_PROVIDER, 1, 2, 3)).rejects.toThrow(/Tile fetch failed/)
  })

  it('getStats counts png tiles and sums sizes', async () => {
    mockFs.addFile(`${BASE_PATH}/osm/1/1/a.png`, Buffer.alloc(100))
    mockFs.addFile(`${BASE_PATH}/osm/1/1/b.png`, Buffer.alloc(200))
    mockFs.addFile(`${BASE_PATH}/osm/1/1/readme.txt`, Buffer.alloc(50))
    const stats = await service.getStats()
    expect(stats.tileCount).toBe(2)
    expect(stats.sizeBytes).toBe(300)
  })

  it('clearCache removes files and recreates the base dir', async () => {
    mockFs.addFile(`${BASE_PATH}/osm/1/1/a.png`, Buffer.alloc(10))
    await service.clearCache()
    expect(mockFs.rm).toHaveBeenCalledWith(BASE_PATH, { recursive: true, force: true })
    expect(await service.hasTile('osm', 1, 1, 1)).toBe(false)
  })

  it('importFromPath imports tiles from a directory tree', async () => {
    mockFs.addFile('/import-src/1/2/3.png', Buffer.from('tile-a'))
    mockFs.addFile('/import-src/2/4/5.png', Buffer.from('tile-b'))

    const progress: number[][] = []
    const result = await service.importFromPath('/import-src', 'osm', (i, s, t) =>
      progress.push([i, s, t])
    )

    expect(result).toEqual({ imported: 2, skipped: 0 })
    expect(progress[progress.length - 1]).toEqual([2, 0, 2])
    expect(await service.hasTile('osm', 1, 2, 3)).toBe(true)
    expect(await service.hasTile('osm', 2, 4, 5)).toBe(true)
  })

  it('importFromPath skips tiles that already exist', async () => {
    mockFs.addFile('/import-src/1/2/3.png', Buffer.from('tile-a'))
    await service.setTile('osm', 1, 2, 3, Buffer.from('existing'))

    const result = await service.importFromPath('/import-src', 'osm')

    expect(result).toEqual({ imported: 0, skipped: 1 })
  })

  it('preloadTiles downloads and emits progress to done', async () => {
    const phases: string[] = []
    service.on('preload-progress', (p: { phase: string }) => phases.push(p.phase))

    await service.preloadTiles('osm', 0, -80, 0, -80, 1, 1)

    expect(phases[0]).toBe('counting')
    expect(phases).toContain('downloading')
    expect(phases[phases.length - 1]).toBe('done')
    expect(fetchFn.mock.calls.length).toBeGreaterThan(0)
  })

  it('preloadTiles can be cancelled between batches', async () => {
    let resolveGate: () => void = () => {}
    const gate = new Promise<void>((r) => (resolveGate = r))
    fetchFn.mockImplementation(() => gate.then(() => okResponse()))

    const phases: string[] = []
    service.on('preload-progress', (p: { phase: string }) => phases.push(p.phase))

    const preload = service.preloadTiles('osm', 85, -85, 179, -179, 2, 2)
    service.cancelPreload()
    resolveGate()
    await preload

    expect(phases[phases.length - 1]).toBe('cancelled')
  })

  it('rejects unknown providers on preloadTiles', async () => {
    await expect(service.preloadTiles('unknown', 0, -1, 1, -1, 1, 1)).rejects.toThrow(
      /Unknown provider/
    )
  })
})
