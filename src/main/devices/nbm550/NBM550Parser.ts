import type { NBM550Sample, NBM550ProbeInfo, NBM550DeviceInfo, NBMUnit } from './nbm550.types'
import type { AppErrorInfo } from '../../../shared/errors/error.types'
import { getNBMErrorInfo } from '../../../shared/errors/nbmErrorCodes'

export class NBM550Parser {
  private unit: NBMUnit = 'V/m'

  private stripQuotes(value: string | null | undefined): string | null {
    if (!value) return null
    const sanitized = value.replace(/^"+|"+$/g, '').trim()
    return sanitized.length > 0 ? sanitized : null
  }

  setUnit(unit: NBMUnit): void {
    this.unit = unit
  }

  // Helper: limpia respuesta cruda del NBM (elimina ;, /CR, whitespace)
  private cleanResponse(raw: string): string {
    return raw
      .trim()
      .replace(/;$/g, '') // Elimina ; al final
      .replace(/\r/g, '') // Elimina /CR (\r)
      .replace(/\n/g, '') // Elimina /LF (\n)
      .trim()
  }

  // Detecta si la respuesta es un código de error del NBM (número solo, sin comas)
  isErrorResponse(raw: string): boolean {
    const clean = this.cleanResponse(raw)
    if (clean.includes(',')) return false
    const code = parseInt(clean)
    return !isNaN(code) && code > 0
  }

  // Parsea respuesta cruda de MEAS?; con SAMPLE_RATE 50 y MEAS_VIEW X-Y-Z
  // Formato esperado: "X, Y, Z, ZeroingFlag, Battery;\r"
  // Respuestas válidas siempre tienen al menos 3 campos (X, Y, Z)
  parseMeasurement(raw: string): NBM550Sample | null {
    try {
      const clean = this.cleanResponse(raw)
      const parts = clean.split(',').map((p) => p.trim())

      // Respuestas válidas de MEAS? tienen mínimo 3 campos (X, Y, Z)
      // Un solo campo numérico es un código de error (ej: "412;")
      if (parts.length < 3) return null

      const rss = parseFloat(parts[0])
      if (isNaN(rss)) return null

      const battery = parts[4] ? parseInt(parts[4]) : 100

      return {
        timestamp: Date.now(),
        rss,
        unit: this.unit,
        battery
      }
    } catch (err: unknown) {
      void err
      return null
    }
  }

  // Parsea respuesta de RESULT_UNIT?;
  parseUnit(raw: string): NBMUnit | null {
    const clean = this.cleanResponse(raw)
    const valid: NBMUnit[] = ['V/m', 'A/m', 'mW/cm^2', 'W/m^2']
    return valid.includes(clean as NBMUnit) ? (clean as NBMUnit) : null
  }

  // Parsea respuesta de BATTERY?; (retorna int 0-100)
  parseBattery(raw: string): number | null {
    try {
      const clean = this.cleanResponse(raw)
      const battery = parseInt(clean)
      if (isNaN(battery) || battery < 0 || battery > 100) {
        return null
      }
      return battery
    } catch (err: unknown) {
      void err
      return null
    }
  }

  // Obtiene info estructurada para un código de error del NBM
  getErrorInfo(code: number): AppErrorInfo | null {
    const entry = getNBMErrorInfo(code)
    if (!entry) return null
    return {
      code: `NBM_${code}`,
      message: entry.message,
      severity: 'error',
      category: 'nbm',
      userAction: entry.userAction,
      retryable: entry.retryable,
      deviceCode: code
    }
  }

  // Parsea error code de respuesta a Set Commands
  parseErrorCode(raw: string): number {
    const clean = this.cleanResponse(raw)
    const code = parseInt(clean)
    return isNaN(code) ? 0 : code
  }

  // Parsea respuesta de PROBE_INFO?;
  // Formato esperado: "modelo,valorNoRelevado,numeroDeSerie,fechaCal;"
  parseProbeInfo(raw: string): NBM550ProbeInfo {
    const clean = this.cleanResponse(raw)
    const parts = clean.split(',').map((p) => p.trim())
    return {
      model: this.stripQuotes(parts[0]),
      serial: this.stripQuotes(parts[2]),
      calibrationDate: this.stripQuotes(parts[3])
    }
  }

  // Parsea respuesta de DEVICE_INFO?;
  // Formato esperado: product_name,production_id,serial_number,device_id,device_type,
  //                    firmware_version,cal_date,cal_due_date,no_of_options,options_name;
  parseDeviceInfo(raw: string): NBM550DeviceInfo {
    const clean = this.cleanResponse(raw)
    const parts = clean.split(',').map((p) => p.trim())
    return {
      productName: this.stripQuotes(parts[0]),
      productionId: this.stripQuotes(parts[1]),
      serialNumber: this.stripQuotes(parts[2]),
      deviceId: this.stripQuotes(parts[3]),
      deviceType: this.stripQuotes(parts[4]),
      firmwareVersion: this.stripQuotes(parts[5]),
      calDate: this.stripQuotes(parts[6]),
      calDueDate: this.stripQuotes(parts[7]),
      noOfOptions: this.stripQuotes(parts[8]),
      optionsName: this.stripQuotes(parts[9])
    }
  }
}
