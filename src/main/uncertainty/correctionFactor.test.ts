import { describe, expect, it } from 'vitest'
import { normalizeProbeName, findFactor, CorrectionFactorResolver } from './correctionFactor'

describe('normalizeProbeName', () => {
  it('uppercases and strips non-alphanumeric characters', () => {
    expect(normalizeProbeName('EF-0391')).toBe('EF0391')
  })

  it('handles strings with spaces and special chars', () => {
    expect(normalizeProbeName(' probe_a/b ')).toBe('PROBEAB')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeProbeName('')).toBe('')
  })
})

describe('findFactor', () => {
  const records = [
    { name: 'EF-0391', factor: 1.37 },
    { name: 'EF-0691', factor: 1.15 }
  ]

  it('finds exact match by normalized name', () => {
    expect(findFactor(records, 'EF-0391')).toBe(1.37)
    expect(findFactor(records, 'EF-0691')).toBe(1.15)
  })

  it('matches case-insensitively', () => {
    expect(findFactor(records, 'ef-0391')).toBe(1.37)
  })

  it('returns null for unknown model', () => {
    expect(findFactor(records, 'EF-9999')).toBeNull()
  })

  it('returns null for empty records', () => {
    expect(findFactor([], 'EF-0391')).toBeNull()
  })
})

describe('CorrectionFactorResolver', () => {
  it('resolves factor from injected data', () => {
    const resolver = new CorrectionFactorResolver(() => [
      { name: 'EF-0391', fMin: 0.1, fMax: 3000, uncertainty: 0, factor: 1.37 }
    ])
    expect(resolver.resolve('EF-0391')).toBe(1.37)
  })

  it('returns null when probeModel is null', () => {
    const resolver = new CorrectionFactorResolver(() => [
      { name: 'EF-0391', fMin: 0.1, fMax: 3000, uncertainty: 0, factor: 1.37 }
    ])
    expect(resolver.resolve(null)).toBeNull()
  })

  it('returns null when data loader returns empty', () => {
    const resolver = new CorrectionFactorResolver(() => [])
    expect(resolver.resolve('EF-0391')).toBeNull()
  })

  it('uses injected data loader for each resolve call', () => {
    const loader = () => [
      { name: 'EF-0391', fMin: 0.1, fMax: 3000, uncertainty: 0, factor: 1.37 }
    ]
    const resolver = new CorrectionFactorResolver(loader)
    expect(resolver.resolve('EF-0391')).toBe(1.37)
    expect(resolver.resolve('UNKNOWN')).toBeNull()
  })
})
