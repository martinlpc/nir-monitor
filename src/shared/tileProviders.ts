export interface TileProvider {
  id: string
  name: string
  url: string
  attribution: string
  maxZoom?: number
  subdomains?: string[]
}

export const TILE_PROVIDERS: TileProvider[] = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    subdomains: ['a', 'b', 'c']
  },
  {
    id: 'osm-hot',
    name: 'OSM Humanitarian',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors, Humanitarian',
    subdomains: ['a', 'b', 'c']
  },
  {
    id: 'carto-light',
    name: 'CartoDB Positron',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    attribution: '&copy; CARTO',
    subdomains: ['a', 'b', 'c', 'd']
  },
  {
    id: 'carto-dark',
    name: 'CartoDB Dark Matter',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution: '&copy; CARTO',
    subdomains: ['a', 'b', 'c', 'd']
  },
  {
    id: 'esri-sat',
    name: 'ESRI Satélite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; ESRI'
  }
]

export function getProvider(id: string): TileProvider | undefined {
  return TILE_PROVIDERS.find((p) => p.id === id)
}

export function buildOriginUrl(provider: TileProvider, z: number, x: number, y: number): string {
  let url = provider.url
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
  if (url.includes('{s}') && provider.subdomains?.length) {
    const subdomain = provider.subdomains[Math.floor(Math.random() * provider.subdomains.length)]
    url = url.replace('{s}', subdomain)
  }
  return url
}
