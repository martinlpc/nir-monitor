import { describe, expect, it } from 'vitest'
import { parseTileUrl } from './TileProtocolHandler'

describe('parseTileUrl', () => {
  it('parses valid tile-cache URLs', () => {
    expect(parseTileUrl('tile-cache://osm/3/4/5.png')).toEqual({
      providerId: 'osm',
      z: 3,
      x: 4,
      y: 5
    })
  })

  it('returns null for non-tile-cache schemes', () => {
    expect(parseTileUrl('https://example.com/tile.png')).toBeNull()
  })

  it('returns null for malformed paths', () => {
    expect(parseTileUrl('tile-cache://osm/3/4/5')).toBeNull()
    expect(parseTileUrl('tile-cache://osm/3/4/abc.png')).toBeNull()
    expect(parseTileUrl('tile-cache://osm/3/x/5.png')).toBeNull()
  })
})
