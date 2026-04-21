import type { NBM550Sample, NBM550ProbeInfo } from './nbm550.types'

export class NBM550Parser {
  private unit: string = 'V/m'

  private stripQuotes(value: string | null | undefined): string | null {
    if (!value) return null
    const sanitized = value.replace(/^"+|"+$/g, '').trim()
    return sanitized.length > 0 ? sanitized : null
  }

  setUnit(unit: string): void {
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
    } catch (err) {
      return null
    }
  }

  // Parsea respuesta de RESULT_UNIT?;
  parseUnit(raw: string): string | null {
    const clean = this.cleanResponse(raw)
    const valid = ['V/m', 'A/m', 'mW/cm^2', 'W/m^2']
    return valid.includes(clean) ? clean : null
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
    } catch (err) {
      return null
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
}
