import { describe, expect, it } from 'vitest'
import { ProbeDataService } from './loadBuiltInData'

const validJson = JSON.stringify({
  version: 2,
  records: [
    { name: 'EF-0391', fMin: 0.1, fMax: 3000, uncertainty: 3.0, factor: 1.37 },
    { name: 'EF-0691', fMin: 0.1, fMax: 3000, uncertainty: 3.0, factor: 1.15 }
  ]
})

describe('ProbeDataService', () => {
  it('loads records from valid JSON', () => {
    const service = new ProbeDataService(
      () => validJson,
      () => '/fake/path.json'
    )
    const records = service.load()
    expect(records).toHaveLength(2)
    expect(records[0].name).toBe('EF-0391')
    expect(records[0].factor).toBe(1.37)
  })

  it('returns empty array when file not found', () => {
    const service = new ProbeDataService(
      () => null,
      () => '/nonexistent.json'
    )
    expect(service.load()).toEqual([])
  })

  it('returns empty array when file has no records array', () => {
    const service = new ProbeDataService(
      () => JSON.stringify({ version: 1 }),
      () => '/fake.json'
    )
    expect(service.load()).toEqual([])
  })

  it('returns empty array on invalid JSON', () => {
    const service = new ProbeDataService(
      () => '{invalid}',
      () => '/fake.json'
    )
    expect(service.load()).toEqual([])
  })

  it('caches records after first load', () => {
    let callCount = 0
    const service = new ProbeDataService(
      () => {
        callCount++
        return validJson
      },
      () => '/fake.json'
    )
    service.load()
    service.load()
    service.load()
    expect(callCount).toBe(1)
  })

  it('returns version after loading', () => {
    const service = new ProbeDataService(
      () => validJson,
      () => '/fake.json'
    )
    expect(service.getVersion()).toBe(2)
  })

  it('returns null version when version field missing', () => {
    const service = new ProbeDataService(
      () => JSON.stringify({ records: [{ name: 'EF-0391', fMin: 0, fMax: 0, uncertainty: 0, factor: 1 }] }),
      () => '/fake.json'
    )
    expect(service.getVersion()).toBeNull()
  })

  it('returns null version when no data loaded', () => {
    const service = new ProbeDataService(
      () => null,
      () => '/fake.json'
    )
    expect(service.getVersion()).toBeNull()
  })

  it('uses injected getProbeDataPath to resolve file', () => {
    let resolvedPath = ''
    const service = new ProbeDataService(
      (path) => {
        resolvedPath = path
        return validJson
      },
      () => '/custom/path/probe-data.json'
    )
    service.load()
    expect(resolvedPath).toBe('/custom/path/probe-data.json')
  })
})
