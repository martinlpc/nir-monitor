import { ipcMain, BrowserWindow, dialog } from 'electron'
import { IPC_HANDLERS, IPC_EVENTS } from './channels'
import type { TileCacheService } from '../tile-cache/TileCacheService'

export function registerTileCacheHandlers(
  window: BrowserWindow,
  tileCache: TileCacheService
): void {
  ipcMain.handle(IPC_HANDLERS.TILE_CACHE_STATS, async () => {
    return await tileCache.getStats()
  })

  ipcMain.handle(IPC_HANDLERS.TILE_CLEAR_CACHE, async () => {
    await tileCache.clearCache()
    return { success: true }
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
      const onProgress = (progress: unknown): void => {
        if (!window.isDestroyed()) {
          window.webContents.send(IPC_EVENTS.TILE_PRELOAD_PROGRESS, progress)
        }
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
    }
  )

  ipcMain.handle(IPC_HANDLERS.TILE_PRELOAD_CANCEL, async () => {
    tileCache.cancelPreload()
    return { success: true }
  })

  ipcMain.handle(
    IPC_HANDLERS.TILE_IMPORT,
    async (
      _event,
      options: {
        providerId: string
      }
    ) => {
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
        if (!window.isDestroyed()) {
          window.webContents.send(IPC_EVENTS.TILE_IMPORT_PROGRESS, { imported, skipped, total })
        }
      }

      const stats = await tileCache.importTiles(sourcePath, options.providerId, onProgress)

      return { success: true, ...stats }
    }
  )
}
