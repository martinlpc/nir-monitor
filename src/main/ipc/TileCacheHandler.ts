import { IPC_HANDLERS } from '../../shared/ipc-channels'
import type { IpcMainLike, EventSink, DialogLike } from './ipcEnv'
import { sanitizeReThrow } from './ipcEnv'
import type { PreloadProgress } from '../../shared/tile.types'

export interface TileCacheLike {
  getStats(): Promise<{ sizeBytes: number; tileCount: number }>
  clearCache(): Promise<void>
  preloadTiles(
    providerId: string,
    north: number,
    south: number,
    east: number,
    west: number,
    minZoom: number,
    maxZoom: number
  ): Promise<void>
  cancelPreload(): void
  importTiles(
    sourcePath: string,
    providerId: string,
    onProgress?: (imported: number, skipped: number, total: number) => void
  ): Promise<{ imported: number; skipped: number }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeListener(event: string, listener: (...args: any[]) => void): unknown
}

export interface TileCacheHandlerDeps {
  tileCache: TileCacheLike
  eventSink: EventSink
  dialog: DialogLike
}

export function registerTileCacheHandlers(ipc: IpcMainLike, deps: TileCacheHandlerDeps): void {
  const { tileCache, eventSink } = deps

  ipc.handle(IPC_HANDLERS.TILE_CACHE_STATS, async () => {
    try {
      return await tileCache.getStats()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipc.handle(IPC_HANDLERS.TILE_CLEAR_CACHE, async () => {
    try {
      await tileCache.clearCache()
      return { success: true }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipc.handle(
    IPC_HANDLERS.TILE_PRELOAD,
    async (
      _event,
      options: {
        providerId: string
        north: number
        south: number
        east: number
        west: number
        minZoom: number
        maxZoom: number
      }
    ) => {
      try {
        const onProgress = (progress: unknown): void => {
          eventSink.send('tile:preload-progress', progress as PreloadProgress)
        }
        tileCache.on('preload-progress', onProgress)

        try {
          await tileCache.preloadTiles(
            options.providerId,
            options.north,
            options.south,
            options.east,
            options.west,
            options.minZoom,
            options.maxZoom
          )
        } finally {
          tileCache.removeListener('preload-progress', onProgress)
        }

        return { success: true }
      } catch (err) {
        sanitizeReThrow(err)
      }
    }
  )

  ipc.handle(IPC_HANDLERS.TILE_PRELOAD_CANCEL, async () => {
    try {
      tileCache.cancelPreload()
      return { success: true }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipc.handle(IPC_HANDLERS.TILE_IMPORT, async (_event, options: { providerId: string }) => {
    try {
      const result = await deps.dialog.showOpenDialog(eventSink.getWindow()!, {
        properties: ['openFile', 'openDirectory'],
        filters: [
          { name: 'Tiles ZIP', extensions: ['zip'] },
          { name: 'Todos', extensions: ['*'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true }
      }

      const sourcePath = result.filePaths[0]

      const onProgress = (imported: number, skipped: number, total: number): void => {
        eventSink.send('tile:import-progress', { imported, skipped, total })
      }

      const stats = await tileCache.importTiles(sourcePath, options.providerId, onProgress)

      return { success: true, ...stats }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })
}
