import { writeFileSync } from 'fs'
import { ConventionalChangelog } from 'conventional-changelog'

const SECTION_TRANSLATIONS = {
  'Bug Fixes': 'Correcciones',
  Features: 'Novedades',
  'Performance Improvements': 'Mejoras de rendimiento',
  Documentation: 'Documentación',
  'Code Refactoring': 'Refactorización',
  Tests: 'Pruebas',
  'Miscellaneous Chores': 'Tareas varias',
  Reverts: 'Reversiones',
  Style: 'Estilo',
  Build: 'Compilación',
  'Continuous Integration': 'Integración continua'
}

const FILTER_KEYWORDS = [
  'mock',
  '.test.',
  'coverage',
  'eslint',
  'prettier',
  'tsconfig',
  'vitest ',
  'casing in git'
]

function processChangelog(raw) {
  const lines = raw.split('\n')
  const result = []
  let inUnreleased = false

  for (let line of lines) {
    if (line.includes('Unreleased')) {
      inUnreleased = true
      continue
    }
    if (inUnreleased) {
      if (line.startsWith('#')) inUnreleased = false
      else continue
    }

    let l = line

    l = l.replace(/^(#+)\s*\[([^\]]+)\]\([^)]*\)\s*\(([^)]*)\)/, '$1 $2 — $3')

    for (const [en, es] of Object.entries(SECTION_TRANSLATIONS)) {
      l = l.replace(`### ${en}`, `### ${es}`)
    }

    if (l.startsWith('* ') || l.startsWith('- ')) {
      l = l.replace(/^\*\s*/, '')
      l = l.replace(/^\-\s*/, '')

      l = l.replace(/^\*\*[\w-]+:\*\*\s*/, '')

      l = l.replace(/\s*\(\[[a-f0-9]+\]\([^)]+\)\)/g, '')
      l = l.replace(/\s*\([a-f0-9]{7,40}\)/g, '')
      l = l.replace(/,?\s*closes\s+\[?#?\w+\]?\([^)]*\)/gi, '')
      l = l.replace(/,?\s*closes\s+#\w+/gi, '')

      const lower = l.toLowerCase()
      if (FILTER_KEYWORDS.some((kw) => lower.includes(kw))) continue

      if (l.trim()) l = '- ' + l
    }

    result.push(l)
  }

  while (result.length > 0 && result[0].trim() === '') result.shift()

  return result.join('\n') + '\n'
}

const stream = new ConventionalChangelog()
  .readPackage()
  .loadPreset('angular')
  .options({ releaseCount: 0 })
  .writeStream()

const chunks = []
stream.on('data', (chunk) => chunks.push(chunk))
stream.on('end', () => {
  const raw = chunks.join('')
  const processed = processChangelog(raw)
  writeFileSync('CHANGELOG.md', processed, 'utf-8')
  console.log('CHANGELOG.md generated')
})
stream.on('error', (err) => {
  console.error('Error generating changelog:', err)
  process.exit(1)
})
