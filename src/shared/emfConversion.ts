export const FREE_SPACE_IMPEDANCE = 377
export const W_PER_MW = 1000
export const M2_PER_CM2 = 10000
export const MEP_REFERENCE_MW_CM2 = 0.2
export const MEP_REFERENCE_VM = 27.5
export const MEP_SAFETY_THRESHOLD_MW_CM2 = MEP_REFERENCE_MW_CM2 * 0.5

const COMBINED_FACTOR = W_PER_MW / (FREE_SPACE_IMPEDANCE * M2_PER_CM2)

export function electricFieldToPowerDensity(electricField: number): number {
  return electricField * electricField * COMBINED_FACTOR
}

export function electricFieldToMepPercent(electricField: number): number {
  const mwCm2 = electricFieldToPowerDensity(electricField)
  return (mwCm2 / MEP_REFERENCE_MW_CM2) * 100
}

export function powerDensityToMepPercent(powerDensity: number): number {
  return (powerDensity / MEP_REFERENCE_MW_CM2) * 100
}
