export type NBMUnit = 'V/m' | 'A/m' | 'mW/cm^2' | 'W/m^2'

export interface NBM550Sample {
  timestamp: number // Unix ms
  rss: number // Result1 = RSS MAX HOLD
  unit: NBMUnit
  battery: number // % 0-100
}

export interface NBM550ProbeInfo {
  model: string | null
  serial: string | null
  calibrationDate: string | null // ISO 8601 o formato crudo del dispositivo
}

export interface NBM550DeviceInfo {
  productName: string | null
  productionId: string | null
  serialNumber: string | null
  deviceId: string | null
  deviceType: string | null
  firmwareVersion: string | null
  calDate: string | null // fecha de calibración del instrumento (meter)
  calDueDate: string | null // fecha de vencimiento de calibración
  noOfOptions: string | null
  optionsName: string | null
}

export interface NBM550Config {
  port: string // 'COM3'
  baudRate: number // 460800
  pollIntervalMs: number // cada cuántos ms pedir muestra, mínimo 200 (5Hz)
  unit: 'V/m' | 'A/m' | 'mW/cm^2' | 'W/m^2'
}

export const NBM550_DEFAULTS: NBM550Config = {
  port: 'COM3',
  baudRate: 460800,
  pollIntervalMs: 200,
  unit: 'V/m'
}
