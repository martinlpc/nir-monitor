import { describe, expect, it } from 'vitest'
import { buildUserAgent } from './tileFetch'

describe('buildUserAgent', () => {
  it('includes version, repo and contact', () => {
    expect(buildUserAgent('1.2.3')).toBe(
      'RNI-Monitor/1.2.3 (+https://github.com/martinlpc/nir-monitor; contact: mpacheco@enacom.gob.ar)'
    )
  })
})
