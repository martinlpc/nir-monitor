export function lonToTileX(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom))
}

export function latToTileY(lat: number, zoom: number): number {
  return Math.floor(
    ((1 -
      Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
      2) *
      Math.pow(2, zoom)
  )
}

export function tileXToLon(x: number, zoom: number): number {
  return (x / Math.pow(2, zoom)) * 360 - 180
}

export function tileYToLat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom)
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

export interface TileRange {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export function getTileRange(
  north: number,
  south: number,
  east: number,
  west: number,
  zoom: number
): TileRange {
  return {
    minX: lonToTileX(west, zoom),
    maxX: lonToTileX(east, zoom),
    minY: latToTileY(north, zoom),
    maxY: latToTileY(south, zoom)
  }
}

export function estimateTileCount(
  north: number,
  south: number,
  east: number,
  west: number,
  minZoom: number,
  maxZoom: number
): number {
  let total = 0
  for (let z = minZoom; z <= maxZoom; z++) {
    const range = getTileRange(north, south, east, west, z)
    total += (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1)
  }
  return total
}

export function estimateTileSizeBytes(count: number): number {
  return count * 256 * 1024
}
