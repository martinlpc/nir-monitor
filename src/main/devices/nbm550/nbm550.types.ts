export interface NBM550Sample {
  timestamp: number // Unix ms
  rss: number // Result1 = RSS MAX HOLD
  unit: string // 'V/m' | 'A/m' | 'mW/cm^2' | 'W/m^2'
  battery: number // % 0-100
}

export interface NBM550ProbeInfo {
  model: string | null
  serial: string | null
  calibrationDate: string | null // ISO 8601 o formato crudo del dispositivo
}

export interface NBM550Config {
  port: string // 'COM3'
  baudRate: 460800
  pollIntervalMs: number // cada cuántos ms pedir muestra, mínimo 200 (5Hz)
  unit: 'V/m' | 'A/m' | 'mW/cm^2' | 'W/m^2'
}

export const NBM550_DEFAULTS: NBM550Config = {
  port: 'COM3',
  baudRate: 460800,
  pollIntervalMs: 200,
  unit: 'V/m'
}
