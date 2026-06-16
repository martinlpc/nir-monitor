import { useState, useEffect, useCallback, useRef } from 'react'

export interface TileCacheStats {
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

export interface ImportProgress {
  imported: number
  skipped: number
  total: number
}

export function useTileCache(): {
  stats: TileCacheStats | null
  isLoading: boolean
  preloadProgress: PreloadProgress | null
  importProgress: ImportProgress | null
  refreshStats: () => Promise<void>
  clearCache: () => Promise<boolean>
  startPreload: (options: {
    providerId: string
    north: number
    south: number
    east: number
    west: number
    minZoom: number
    maxZoom: number
  }) => Promise<void>
  cancelPreload: () => Promise<void>
  importTiles: (providerId: string) => Promise<{ imported: number; skipped: number } | null>
} {
  const [stats, setStats] = useState<TileCacheStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [preloadProgress, setPreloadProgress] = useState<PreloadProgress | null>(null)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)

  const preloadUnsubRef = useRef<(() => void) | null>(null)
  const importUnsubRef = useRef<(() => void) | null>(null)

  const refreshStats = useCallback(async () => {
    try {
      const result = await window.api.tileCache.getStats()
      setStats(result)
    } catch (err) {
      console.error('[useTileCache] Error getting stats:', err)
    }
  }, [])

  const clearCache = useCallback(async () => {
    try {
      const result = await window.api.tileCache.clearCache()
      if (result.success) {
        setStats({ sizeBytes: 0, tileCount: 0 })
        return true
      }
      return false
    } catch (err) {
      console.error('[useTileCache] Error clearing cache:', err)
      return false
    }
  }, [])

  const startPreload = useCallback(
    async (options: {
      providerId: string
      north: number
      south: number
      east: number
      west: number
      minZoom: number
      maxZoom: number
    }) => {
      setPreloadProgress({ current: 0, total: 0, zoom: 0, phase: 'counting' })

      const unsub = window.api.tileCache.onPreloadProgress((progress) => {
        setPreloadProgress(progress)
        if (
          progress.phase === 'done' ||
          progress.phase === 'cancelled' ||
          progress.phase === 'error'
        ) {
          refreshStats()
        }
      })
      preloadUnsubRef.current = unsub

      try {
        await window.api.tileCache.preloadTiles(options)
      } catch (err) {
        console.error('[useTileCache] Preload error:', err)
        setPreloadProgress((prev) =>
          prev ? { ...prev, phase: 'error', error: String(err) } : null
        )
      }
    },
    [refreshStats]
  )

  const cancelPreload = useCallback(async () => {
    try {
      await window.api.tileCache.cancelPreload()
    } catch (err) {
      console.error('[useTileCache] Cancel error:', err)
    }
  }, [])

  const importTiles = useCallback(
    async (providerId: string): Promise<{ imported: number; skipped: number } | null> => {
      setIsLoading(true)
      setImportProgress(null)

      const unsub = window.api.tileCache.onImportProgress((progress) => {
        setImportProgress(progress)
      })
      importUnsubRef.current = unsub

      try {
        const result = await window.api.tileCache.importTiles({ providerId })
        if (result.canceled) {
          return null
        }
        await refreshStats()
        return { imported: result.imported ?? 0, skipped: result.skipped ?? 0 }
      } catch (err) {
        console.error('[useTileCache] Import error:', err)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [refreshStats]
  )

  useEffect(() => {
    refreshStats()
  }, [refreshStats])

  useEffect(() => {
    return () => {
      preloadUnsubRef.current?.()
      importUnsubRef.current?.()
    }
  }, [])

  useEffect(() => {
    const id = setInterval(refreshStats, 5000)
    return () => clearInterval(id)
  }, [refreshStats])

  return {
    stats,
    isLoading,
    preloadProgress,
    importProgress,
    refreshStats,
    clearCache,
    startPreload,
    cancelPreload,
    importTiles
  }
}
