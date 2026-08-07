import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { IPC_HANDLERS } from './channels'
import { registerTileCacheHandlers } from './TileCacheHandler'
import type { TileCacheHandlerDeps } from './TileCacheHandler'
import type { EventSink, DialogLike } from './ipcEnv'
import type { PreloadProgress } from '../../shared/tile.types'
import { createFakeIpc } from './ipcTestUtils'

const PRELOAD_OPTIONS = {
  providerId: 'osm',
  north: 1,
  south: -1,
  east: 1,
  west: -1,
  minZoom: 1,
  maxZoom: 2
}

class FakeTileCache extends EventEmitter {
  getStats = vi.fn(async () => ({ sizeBytes: 100, tileCount: 5 }))
  clearCache = vi.fn(async () => {})
  preloadTiles = vi.fn(async () => {})
  cancelPreload = vi.fn()
  importTiles: Mock<
    (
      sourcePath: string,
      providerId: string,
      onProgress?: (imported: number, skipped: number, total: number) => void
    ) => Promise<{ imported: number; skipped: number }>
  > = vi.fn(async () => ({ imported: 2, skipped: 1 }))
}

function makeDeps(
  overrides: Partial<TileCacheHandlerDeps> = {}
): TileCacheHandlerDeps & { tileCache: FakeTileCache; eventSink: EventSink } {
  const tileCache = new FakeTileCache()
  const eventSink: EventSink = {
    send: vi.fn(),
    getWindow: () => null,
    alert: vi.fn()
  }
  const dialog: DialogLike = {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn()
  }
  const deps: TileCacheHandlerDeps = {
    tileCache,
    eventSink,
    dialog,
    ...overrides
  }
  return { ...deps, tileCache, eventSink }
}

describe('registerTileCacheHandlers', () => {
  it('TILE_CACHE_STATS returns the cache stats', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerTileCacheHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.TILE_CACHE_STATS)!(undefined)
    expect(result).toEqual({ sizeBytes: 100, tileCount: 5 })
    expect(deps.tileCache.getStats).toHaveBeenCalledOnce()
  })

  it('TILE_CLEAR_CACHE clears the cache', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerTileCacheHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.TILE_CLEAR_CACHE)!(undefined)
    expect(result).toEqual({ success: true })
    expect(deps.tileCache.clearCache).toHaveBeenCalledOnce()
  })

  it('TILE_PRELOAD forwards options and returns success', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerTileCacheHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.TILE_PRELOAD)!(undefined, PRELOAD_OPTIONS)
    expect(deps.tileCache.preloadTiles).toHaveBeenCalledWith('osm', 1, -1, 1, -1, 1, 2)
    expect(result).toEqual({ success: true })
  })

  it('TILE_PRELOAD forwards progress events and detaches the listener', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerTileCacheHandlers(ipc, deps)

    const progress: PreloadProgress = { current: 1, total: 10, zoom: 1, phase: 'downloading' }
    const pending = handlers.get(IPC_HANDLERS.TILE_PRELOAD)!(undefined, PRELOAD_OPTIONS)

    deps.tileCache.emit('preload-progress', progress)

    await pending

    expect(deps.eventSink.send).toHaveBeenCalledWith('tile:preload-progress', progress)
    expect(deps.tileCache.listenerCount('preload-progress')).toBe(0)
  })

  it('TILE_PRELOAD_CANCEL cancels the running preload', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerTileCacheHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.TILE_PRELOAD_CANCEL)!(undefined)
    expect(result).toEqual({ success: true })
    expect(deps.tileCache.cancelPreload).toHaveBeenCalledOnce()
  })

  it('TILE_IMPORT imports tiles from the selected path', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps({
      dialog: {
        showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/tiles.zip'] })),
        showSaveDialog: vi.fn()
      }
    })

    registerTileCacheHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.TILE_IMPORT)!(undefined, { providerId: 'osm' })
    expect(result).toEqual({ success: true, imported: 2, skipped: 1 })
    expect(deps.tileCache.importTiles).toHaveBeenCalledWith(
      '/tiles.zip',
      'osm',
      expect.any(Function)
    )
  })

  it('TILE_IMPORT returns canceled when the dialog is dismissed', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps({
      dialog: {
        showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
        showSaveDialog: vi.fn()
      }
    })

    registerTileCacheHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.TILE_IMPORT)!(undefined, { providerId: 'osm' })
    expect(result).toEqual({ success: false, canceled: true })
    expect(deps.tileCache.importTiles).not.toHaveBeenCalled()
  })

  it('TILE_IMPORT forwards import progress events', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps({
      dialog: {
        showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/tiles'] })),
        showSaveDialog: vi.fn()
      }
    })

    registerTileCacheHandlers(ipc, deps)

    await handlers.get(IPC_HANDLERS.TILE_IMPORT)!(undefined, { providerId: 'osm' })

    const importCb = deps.tileCache.importTiles.mock.calls[0]?.[2]
    expect(importCb).toBeTypeOf('function')
    importCb!(3, 1, 4)
    expect(deps.eventSink.send).toHaveBeenCalledWith('tile:import-progress', {
      imported: 3,
      skipped: 1,
      total: 4
    })
  })

  it('TILE_PRELOAD rethrows a sanitized error when preload fails', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()
    deps.tileCache.preloadTiles.mockRejectedValueOnce(new Error('timeout'))

    registerTileCacheHandlers(ipc, deps)

    await expect(
      handlers.get(IPC_HANDLERS.TILE_PRELOAD)!(undefined, PRELOAD_OPTIONS)
    ).rejects.toThrow('La operación superó el tiempo de espera. Intentá de nuevo.')
  })
})
