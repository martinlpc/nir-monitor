import { useState, useCallback, useEffect } from 'react'
import type { TileProvider } from '../../../shared/tileProviders'
import { TILE_PROVIDERS, getProvider } from '../../../shared/tileProviders'

const STORAGE_KEY = 'nir-tile-provider'

export function useTileProvider(): {
  provider: TileProvider
  setProvider: (id: string) => void
  providers: typeof TILE_PROVIDERS
  tileUrl: string
  tileAttribution: string
} {
  const [providerId, setProviderId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'osm'
    } catch {
      return 'osm'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, providerId)
    } catch {
      // localStorage not available
    }
  }, [providerId])

  const provider = getProvider(providerId) || TILE_PROVIDERS[0]
  const tileUrl = `tile-cache://${provider.id}/{z}/{x}/{y}.png`
  const tileAttribution = provider.attribution

  const setProvider = useCallback((id: string) => {
    setProviderId(id)
  }, [])

  return { provider, setProvider, providers: TILE_PROVIDERS, tileUrl, tileAttribution }
}
