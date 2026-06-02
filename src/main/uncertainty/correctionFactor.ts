import { readFileSync, existsSync } from 'fs'

const SEPARATORS = ['\t', ';', ',']

export function normalizeProbeName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function parseUncertaintyFile(
  content: string
): Array<{ name: string; factor: number }> {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length <= 1) return []
  const sep = guessSeparator(lines[0])
  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(sep).map((c) => c.trim())
      return { name: cols[0] || '', factor: parseFloat(cols[4]) || 1 }
    })
    .filter((r) => r.name.length > 0)
}

function guessSeparator(line: string): string {
  for (const sep of SEPARATORS) {
    if (line.includes(sep)) return sep
  }
  return ','
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

export function resolveCorrectionFactor(
  probeModel: string | null,
  uncertaintyFilePath?: string
): number | null {
  if (!probeModel || !uncertaintyFilePath) return null
  if (!existsSync(uncertaintyFilePath)) return null
  try {
    const content = readFileSync(uncertaintyFilePath, 'utf-8')
    const records = parseUncertaintyFile(content)
    return findFactor(records, probeModel)
  } catch {
    return null
  }
}
