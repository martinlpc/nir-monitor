import { describe, expect, it } from 'vitest'
import {
  buildSection,
  headingFor,
  isListed,
  parseCommit,
  prependSection
} from './changelog-lib.mjs'

describe('parseCommit', () => {
  it('reads type, scope and description', () => {
    expect(parseCommit('fix(export): escape XML entities in KMZ output')).toEqual({
      type: 'fix',
      scope: 'export',
      breaking: false,
      description: 'escape XML entities in KMZ output'
    })
  })

  it('accepts commits without scope and flags breaking changes', () => {
    expect(parseCommit('feat!: drop support for X')).toMatchObject({
      type: 'feat',
      scope: '',
      breaking: true
    })
  })

  it.each([
    'Update README with omitted earlier versions changes',
    "Merge branch 'fix/audit-phase-1-bugs' into 'main'",
    'wip: something',
    'fix:missing space'
  ])('ignores %j', (subject) => {
    expect(parseCommit(subject)).toBeNull()
  })
})

describe('isListed', () => {
  it('leaves out the version bump commit', () => {
    expect(isListed(parseCommit('chore: bump to 0.18.2 and update changelog/manual/readme'))).toBe(
      false
    )
    expect(isListed(parseCommit('chore: bump electron from 42.0.0 to 42.1.0'))).toBe(false)
  })

  it('leaves out tooling noise but keeps other chores', () => {
    expect(isListed(parseCommit('style: apply prettier formatting across codebase'))).toBe(false)
    expect(isListed(parseCommit('chore: stop tracking coverage reports'))).toBe(false)
    expect(isListed(parseCommit('chore: add usb dependency for Garmin 18x USB driver'))).toBe(true)
  })
})

describe('headingFor', () => {
  it('uses ## for patch versions and # for minor or major ones', () => {
    expect(headingFor('0.18.2', '2026-11-12')).toBe('## 0.18.2 — 2026-11-12')
    expect(headingFor('0.19.0', '2026-12-01')).toBe('# 0.19.0 — 2026-12-01')
    expect(headingFor('1.0.0', '2027-01-01')).toBe('# 1.0.0 — 2027-01-01')
  })
})

describe('buildSection', () => {
  it('reproduces the 0.18.2 section already published', () => {
    const section = buildSection('0.18.2', '2026-11-12', [
      'fix(drivers): quote the inf path so pnputil works from Program Files',
      'fix(import): validate geojson points and skip the invalid ones',
      'fix(db): save a full session in a single transaction',
      'fix(session): stop at the point limit and alert when a save fails',
      'fix(db): journal every point and write the database atomically',
      'chore: bump to 0.18.1 and update changelog/manual/readme'
    ])

    expect(section).toBe(
      [
        '## 0.18.2 — 2026-11-12',
        '',
        '### Correcciones',
        '',
        '- journal every point and write the database atomically',
        '- save a full session in a single transaction',
        '- quote the inf path so pnputil works from Program Files',
        '- validate geojson points and skip the invalid ones',
        '- stop at the point limit and alert when a save fails',
        ''
      ].join('\n')
    )
  })

  it('lists every commit type, not only features and fixes', () => {
    const section = buildSection('0.16.2', '2026-08-31', [
      'refactor(db): extract schema and row mappers from SQLiteSessionRepository',
      'test: cover KMZ and XLSX exporters with real file assertions',
      'fix(ipc): wire missing ports:list handler and move logs handlers into ipc',
      'chore: add release notes template',
      'docs: describe bundled Zadig usage',
      'feat: add optical connection type selector',
      'perf: batch tile writes'
    ])

    const titles = section.split('\n').filter((line) => line.startsWith('### '))
    expect(titles).toEqual([
      '### Correcciones',
      '### Refactorización',
      '### Documentación',
      '### Novedades',
      '### Tareas varias',
      '### Mejoras de rendimiento',
      '### Pruebas'
    ])
    expect(section).toContain('- extract schema and row mappers from SQLiteSessionRepository')
  })

  it('puts breaking changes in their own section and strips issue references', () => {
    const section = buildSection('1.0.0', '2027-01-01', [
      'feat(api)!: drop the legacy export format, closes #12',
      'fix: prevent crash on empty port list closes #7'
    ])

    expect(section).toContain('### Cambios incompatibles\n\n- drop the legacy export format\n')
    expect(section).toContain('### Correcciones\n\n- prevent crash on empty port list\n')
  })

  it('returns null when nothing belongs in the changelog', () => {
    expect(
      buildSection('0.18.3', '2026-11-13', [
        'chore: bump to 0.18.2 and update changelog/manual/readme',
        'Update README',
        'style: apply prettier formatting'
      ])
    ).toBeNull()
    expect(buildSection('0.18.3', '2026-11-13', [])).toBeNull()
  })
})

describe('prependSection', () => {
  const previous = [
    '## 0.18.1 — 2026-11-12',
    '',
    '### Correcciones',
    '',
    '- escape XML entities in KMZ output',
    '',
    '## 0.16.2 — 2026-08-31',
    '',
    '### Refactorización',
    '',
    '- edited by hand',
    ''
  ].join('\n')

  const section = '## 0.18.2 — 2026-11-12\n\n### Correcciones\n\n- new fix\n'

  it('puts the new version first and leaves earlier ones untouched', () => {
    const result = prependSection(previous, section, '0.18.2')

    expect(
      result.startsWith('## 0.18.2 — 2026-11-12\n\n### Correcciones\n\n- new fix\n\n## 0.18.1')
    ).toBe(true)
    expect(result.endsWith(previous)).toBe(true)
  })

  it('replaces the section when run again for the same version', () => {
    const once = prependSection(previous, section, '0.18.2')
    const updated = '## 0.18.2 — 2026-11-12\n\n### Correcciones\n\n- new fix\n- another fix\n'

    const twice = prependSection(once, updated, '0.18.2')

    expect(twice.match(/0\.18\.2/g)).toHaveLength(1)
    expect(twice).toContain('- another fix')
    expect(twice.endsWith(previous)).toBe(true)
  })

  it('does not confuse a version that only shares a prefix', () => {
    const result = prependSection('## 0.18.20 — 2027-01-01\n\n- x\n', section, '0.18.2')
    expect(result).toContain('## 0.18.20 — 2027-01-01')
  })

  it('creates the file content when there is no changelog yet', () => {
    expect(prependSection('', section, '0.18.2')).toBe(section)
  })

  it('normalizes CRLF line endings', () => {
    const result = prependSection(previous.replace(/\n/g, '\r\n'), section, '0.18.2')
    expect(result).not.toContain('\r')
    expect(result.endsWith(previous)).toBe(true)
  })
})
