import { ipcMain, BrowserWindow, dialog } from 'electron'
import { IPC_HANDLERS } from './channels'
import { toUserError } from '../../shared/errors/toUserError'
import type { TileCacheService } from '../tile-cache/TileCacheService'
import type { EventBus } from '../services/EventBus'
import type { EventMap } from '../services/EventBus'

function sanitizeReThrow(err: unknown): never {
  const { message, technical } = toUserError(err)
  console.error(`[IPC] ${technical}`)
  throw new Error(message)
}

export function registerTileCacheHandlers(
  window: BrowserWindow,
  eventBus: EventBus,
  tileCache: TileCacheService
): void {
  ipcMain.handle(IPC_HANDLERS.TILE_CACHE_STATS, async () => {
    try {
      return await tileCache.getStats()
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipcMain.handle(IPC_HANDLERS.TILE_CLEAR_CACHE, async () => {
    try {
      await tileCache.clearCache()
      return { success: true }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipcMain.handle(
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
          eventBus.send('tile:preload-progress', progress as EventMap['tile:preload-progress'])
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

  ipcMain.handle(IPC_HANDLERS.TILE_PRELOAD_CANCEL, async () => {
    try {
      tileCache.cancelPreload()
      return { success: true }
    } catch (err) {
      sanitizeReThrow(err)
    }
  })

  ipcMain.handle(
    IPC_HANDLERS.TILE_IMPORT,
    async (
      _event,
      options: {
        providerId: string
      }
    ) => {
      try {
        const result = await dialog.showOpenDialog(window, {
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
          eventBus.send('tile:import-progress', { imported, skipped, total })
        }

        const stats = await tileCache.importTiles(sourcePath, options.providerId, onProgress)

        return { success: true, ...stats }
      } catch (err) {
        sanitizeReThrow(err)
      }
    }
  )
}
