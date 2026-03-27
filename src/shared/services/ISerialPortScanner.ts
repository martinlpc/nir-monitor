// Interface para escaneo de puertos - inyectable
import type { ProbedDeviceInfo } from '../dto/index'

export interface ISerialPortScanner {
  /**
   * Lista todos los puertos seriales disponibles
   */
  listAvailablePorts(): Promise<string[]>

  /**
   * Escanea todos los puertos y retorna dispositivos detectados
   */
  scanAndProbeAll(): Promise<{
    nbmPort: string | null
    gpsPort: string | null
    allProbed: ProbedDeviceInfo[]
  }>

  /**
   * Intenta detectar NBM550 en un puerto específico
   */
  probeNBM(port: string, timeoutMs?: number): Promise<boolean>

  /**
   * Intenta detectar GPS en un puerto específico
   */
  probeGPS(port: string, timeoutMs?: number): Promise<boolean>
}
