import type { NBM550Sample } from './nbm550.types'

export class NBM550Parser {
  private unit: string = 'V/m'

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

  // Parsea respuesta cruda de MEAS?; con SAMPLE_RATE 50 y MEAS_VIEW X-Y-Z
  // Formato esperado: "X, Y, Z, ZeroingFlag, Battery;\r"
  parseMeasurement(raw: string): NBM550Sample | null {
    try {
      const clean = this.cleanResponse(raw)
      const parts = clean.split(',').map((p) => p.trim())

      if (parts.length < 1) return null

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
}
