import {
  electricFieldToMepPercent,
  electricFieldToPowerDensity,
  MEP_SAFETY_THRESHOLD_MW_CM2
} from '../../../shared/emfConversion'

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

export function valueToPercent(valueVm: number): number {
  return electricFieldToMepPercent(valueVm)
}

export function getIntensityColor(valueVm: number): string {
  const percent = valueToPercent(valueVm)

  for (const level of INTENSITY_LEVELS) {
    if (percent <= level.maxPercent) {
      return level.color
    }
  }

  return OVER_100_COLOR
}

export function exceedsSafetyThreshold(valueVm: number): boolean {
  const mwCm2 = electricFieldToPowerDensity(valueVm)
  return mwCm2 >= MEP_SAFETY_THRESHOLD_MW_CM2
}

export function sessionExceedsThreshold(values: number[]): boolean {
  return values.some((v) => exceedsSafetyThreshold(v))
}

export { INTENSITY_LEVELS, OVER_100_COLOR }
