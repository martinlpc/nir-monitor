import type { NBM550Sample } from './nbm550.types'

export class NBM550Parser {
  private unit: string = 'V/m'

  setUnit(unit: string): void {
    this.unit = unit
  }

  // Parsea respuesta cruda de MEAS?; con SAMPLE_RATE 50 y MEAS_VIEW X-Y-Z
  // Formato esperado: "X, Y, Z, ZeroingFlag, Battery;\r"
  parseMeasurement(raw: string): NBM550Sample | null {
    try {
      const clean = raw.trim().replace(/;$/, '').trim()
      const parts = clean.split(',').map((p) => p.trim())

      if (parts.length < 1) return null

      const rss = parseFloat(parts[0])
      if (isNaN(rss)) return null

      const battery = parts[2] ? parseInt(parts[2]) : 100

      return {
        timestamp: Date.now(),
        rss,
        unit: this.unit,
        battery
      }
    } catch {
      return null
    }
  }

  // Parsea respuesta de RESULT_UNIT?;
  parseUnit(raw: string): string | null {
    const clean = raw.trim().replace(/;$/, '').trim()
    const valid = ['V/m', 'A/m', 'mW/cm^2', 'W/m^2']
    return valid.includes(clean) ? clean : null
  }

  // Parsea error code de respuesta a Set Commands
  parseErrorCode(raw: string): number {
    const clean = raw.trim().replace(/;$/, '').trim()
    return parseInt(clean) || 0
  }
}
