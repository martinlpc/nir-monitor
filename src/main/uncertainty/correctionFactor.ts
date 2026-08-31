import type { ProbeRecord } from './loadBuiltInData'

export type ProbeDataLoader = () => ProbeRecord[]

export function normalizeProbeName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function findFactor(
  records: Array<{ name: string; factor: number }>,
  probeModel: string
): number | null {
  const normalized = normalizeProbeName(probeModel)
  const matched =
    records.find((r) => normalizeProbeName(r.name) === normalized) ??
    records.find((r) => {
      const nr = normalizeProbeName(r.name)
      return normalized.includes(nr) || nr.includes(normalized)
    })
  return matched?.factor ?? null
}

export class CorrectionFactorResolver {
  constructor(private loadProbeData: ProbeDataLoader) {}

  resolve(probeModel: string | null): number | null {
    if (!probeModel) return null
    const records = this.loadProbeData()
    if (records.length === 0) return null
    return findFactor(records, probeModel)
  }
}
