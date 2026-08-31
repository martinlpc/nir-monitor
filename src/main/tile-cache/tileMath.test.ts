import { describe, expect, it } from 'vitest'
import {
  lonToTileX,
  latToTileY,
  tileXToLon,
  tileYToLat,
  getTileRange,
  estimateTileCount,
  estimateTileSizeBytes
} from './tileMath'

describe('tileMath', () => {
  it('lonToTileX returns 0 for west bound at any zoom', () => {
    expect(lonToTileX(-180, 0)).toBe(0)
    expect(lonToTileX(-180, 5)).toBe(0)
  })

  it('lonToTileX returns 2^zoom for east bound', () => {
    expect(lonToTileX(180, 2)).toBe(4)
    expect(lonToTileX(180, 3)).toBe(8)
  })

  it('lonToTileX preserves tile containment', () => {
    const zoom = 10
    const lon = -58.4
    const x = lonToTileX(lon, zoom)
    expect(tileXToLon(x, zoom)).toBeLessThanOrEqual(lon)
    expect(tileXToLon(x + 1, zoom)).toBeGreaterThan(lon)
  })

  it('latToTileY returns 0 for north bound', () => {
    expect(latToTileY(85, 1)).toBe(0)
    expect(latToTileY(85, 2)).toBe(0)
  })

  it('latToTileY preserves tile containment', () => {
    const zoom = 10
    const lat = -34.6
    const y = latToTileY(lat, zoom)
    expect(tileYToLat(y, zoom)).toBeGreaterThanOrEqual(lat)
    expect(tileYToLat(y + 1, zoom)).toBeLessThan(lat)
  })

  it('getTileRange computes min/max bounds for region', () => {
    const range = getTileRange(0, -80, 0, -80, 1)
    expect(range.minX).toBeLessThanOrEqual(range.maxX)
    expect(range.minY).toBeLessThanOrEqual(range.maxY)
    expect(typeof range.minX).toBe('number')
    expect(typeof range.maxY).toBe('number')
  })

  it('estimateTileCount sums per-zoom tile ranges', () => {
    const count = estimateTileCount(85, -85, 179, -179, 1, 2)
    const z1 = getTileRange(85, -85, 179, -179, 1)
    const z2 = getTileRange(85, -85, 179, -179, 2)
    const expected =
      (z1.maxX - z1.minX + 1) * (z1.maxY - z1.minY + 1) +
      (z2.maxX - z2.minX + 1) * (z2.maxY - z2.minY + 1)
    expect(count).toBe(expected)
  })

  it('estimateTileSizeBytes scales linearly', () => {
    expect(estimateTileSizeBytes(10)).toBe(10 * 256 * 1024)
  })
})
