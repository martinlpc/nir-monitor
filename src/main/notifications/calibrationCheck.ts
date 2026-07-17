export type CalibrationStatus = 'valid' | 'expiring' | 'expired' | 'unknown'

export interface CalibrationResult {
  status: CalibrationStatus
  daysUntilExpiry: number | null
  message: string
}

const EXPIRING_SOON_DAYS = 30
const DEFAULT_VALIDITY_MONTHS = 24

/**
 * Parsea una fecha en formato ISO 8601 o formato crudo del NBM-550.
 * Soporta: "2024-06-01", "2024-06-01T00:00:00", "01/06/2024", etc.
 */
function parseCalibrationDate(dateStr: string): Date | null {
  if (!dateStr) return null

  const trimmed = dateStr.trim()

  // Intentar ISO 8601 directamente
  const iso = new Date(trimmed)
  if (!isNaN(iso.getTime())) return iso

  // Intentar formato DD/MM/YYYY
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dmy) {
    const [, day, month, year] = dmy
    const d = new Date(Number(year), Number(month) - 1, Number(day))
    if (!isNaN(d.getTime())) return d
  }

  return null
}

/**
 * Evalúa el estado de calibración de un instrumento o sonda.
 * @param calibrationDate - Fecha de calibración en formato ISO o NBM
 * @param validityMonths - Validez en meses (default: 24 = 2 años)
 * @param referenceDate - Fecha de referencia para el cálculo (default: ahora)
 */
export function checkCalibrationStatus(
  calibrationDate: string | null,
  validityMonths: number = DEFAULT_VALIDITY_MONTHS,
  referenceDate: Date = new Date()
): CalibrationResult {
  if (!calibrationDate) {
    return {
      status: 'unknown',
      daysUntilExpiry: null,
      message: 'Fecha de calibración no disponible'
    }
  }

  const calDate = parseCalibrationDate(calibrationDate)
  if (!calDate) {
    return {
      status: 'unknown',
      daysUntilExpiry: null,
      message: `Formato de fecha inválido: "${calibrationDate}"`
    }
  }

  const dueDate = new Date(calDate)
  dueDate.setMonth(dueDate.getMonth() + validityMonths)

  const diffMs = dueDate.getTime() - referenceDate.getTime()
  const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (daysUntilExpiry < 0) {
    const overdueDays = Math.abs(daysUntilExpiry)
    return {
      status: 'expired',
      daysUntilExpiry,
      message: `Calibración vencida hace ${overdueDays} día${overdueDays !== 1 ? 's' : ''}`
    }
  }

  if (daysUntilExpiry <= EXPIRING_SOON_DAYS) {
    return {
      status: 'expiring',
      daysUntilExpiry,
      message: `Calibración vence en ${daysUntilExpiry} día${daysUntilExpiry !== 1 ? 's' : ''}`
    }
  }

  return {
    status: 'valid',
    daysUntilExpiry,
    message: `Calibración válida hasta ${dueDate.toLocaleDateString('es-AR')}`
  }
}
