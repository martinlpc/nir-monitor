export type DriverType = 'ftdi' | 'prolific' | 'ch340' | 'cp210x' | 'cdc_acm' | 'unknown'

export interface PortDriverInfo {
  path: string
  driverType: DriverType
  installed: boolean
  friendlyName: string | null
  manufacturer: string | null
  vendorId: string | null
  productId: string | null
}

export interface DriverCheckResult {
  ports: PortDriverInfo[]
  missing: PortDriverInfo[]
}
