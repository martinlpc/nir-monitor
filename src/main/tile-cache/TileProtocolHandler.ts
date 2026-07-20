import { protocol } from 'electron'
import { Buffer } from 'buffer'
import { getProvider, buildOriginUrl } from '../../shared/tileProviders'
import type { TileCacheService } from './TileCacheService'
import { tileFetch } from './tileFetch'

const SCHEME = 'tile-cache'
// tile-cache://providerId/z/x/y.png
const URL_RE = new RegExp(`^${SCHEME}:\\/\\/([^/]+)\\/(\\d+)\\/(\\d+)\\/(\\d+)\\.png$`)

function parseTileUrl(urlStr: string): {
  providerId: string
  z: number
  x: number
  y: number
} | null {
  const match = urlStr.match(URL_RE)
  if (!match) return null
  return {
    providerId: match[1],
    z: parseInt(match[2], 10),
    x: parseInt(match[3], 10),
    y: parseInt(match[4], 10)
  }
}

export function registerTileProtocol(cacheService: TileCacheService): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const parsed = parseTileUrl(request.url)
      if (!parsed) {
        console.warn(`[TileProtocol] Invalid tile URL: ${request.url}`)
        return new Response('Invalid tile URL', { status: 400 })
      }

      const { providerId, z, x, y } = parsed
      const provider = getProvider(providerId)
      if (!provider) {
        return new Response(`Unknown provider: ${providerId}`, { status: 400 })
      }

      // 1. Try disk cache
      const cached = await cacheService.getTile(providerId, z, x, y)
      if (cached) {
        return new Response(new Uint8Array(cached), {
          status: 200,
          headers: { 'Content-Type': 'image/png' }
        })
      }

      // 2. Fetch from origin
      const originUrl = buildOriginUrl(provider, z, x, y)
      const response = await tileFetch(originUrl)
      if (!response.ok) {
        return new Response(`Origin fetch failed: ${response.status}`, {
          status: response.status
        })
      }

      const buf = Buffer.from(await response.arrayBuffer())

      cacheService.setTile(providerId, z, x, y, buf).catch(() => {})

      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: { 'Content-Type': 'image/png' }
      })
    } catch (err) {
      console.error(`[TileProtocol] Handler error for ${request.url}:`, err)
      return new Response('Tile fetch failed', { status: 502 })
    }
  })

  console.log(`[TileProtocol] Registered custom protocol: ${SCHEME}://`)
}
