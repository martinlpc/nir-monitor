/**
 * Paleta de colores por intensidad de campo eléctrico.
 * El 100% del nivel de referencia = 27.5 V/m
 * El 50% (umbral de seguridad) = 19.44 V/m
 */

const REFERENCE_LEVEL_VM = 27.5
const SAFETY_THRESHOLD_VM = 19.44

interface IntensityLevel {
  maxPercent: number
  color: string
  label: string
}

const INTENSITY_LEVELS: IntensityLevel[] = [
  { maxPercent: 1, color: '#73C2FB', label: '≤ 1%' },
  { maxPercent: 2, color: '#1E90FF', label: '≤ 2%' },
  { maxPercent: 4, color: '#2A52BE', label: '≤ 4%' },
  { maxPercent: 8, color: '#90EE90', label: '≤ 8%' },
  { maxPercent: 15, color: '#32CD32', label: '≤ 15%' },
  { maxPercent: 20, color: '#008000', label: '≤ 20%' },
  { maxPercent: 35, color: '#FFDF00', label: '≤ 35%' },
  { maxPercent: 50, color: '#FFA500', label: '≤ 50%' },
  { maxPercent: 100, color: '#FF4500', label: '≤ 100%' }
]

const OVER_100_COLOR = '#FF0000'

/**
 * Calcula el porcentaje del nivel de referencia
 */
export function valueToPercent(valueVm: number): number {
  return (valueVm / REFERENCE_LEVEL_VM) * 100
}

/**
 * Obtiene el color de la paleta según el valor final en V/m
 */
export function getIntensityColor(valueVm: number): string {
  const percent = valueToPercent(valueVm)

  for (const level of INTENSITY_LEVELS) {
    if (percent <= level.maxPercent) {
      return level.color
    }
  }

  return OVER_100_COLOR
}

/**
 * Determina si un valor supera el umbral de seguridad del 50% (19.44 V/m)
 */
export function exceedsSafetyThreshold(valueVm: number): boolean {
  return valueVm >= SAFETY_THRESHOLD_VM
}

/**
 * Verifica si algún punto de la sesión superó el umbral de seguridad
 */
export function sessionExceedsThreshold(values: number[]): boolean {
  return values.some((v) => exceedsSafetyThreshold(v))
}

export { REFERENCE_LEVEL_VM, SAFETY_THRESHOLD_VM, INTENSITY_LEVELS, OVER_100_COLOR }
