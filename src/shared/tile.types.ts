export interface CacheStats {
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
