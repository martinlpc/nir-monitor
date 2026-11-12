// Lógica pura del changelog incremental: sin git ni sistema de archivos, para poder testearla.

/** Secciones en el orden en que aparecen dentro de una versión. */
export const SECTIONS = [
  { type: 'fix', title: 'Correcciones' },
  { type: 'build', title: 'Compilación' },
  { type: 'refactor', title: 'Refactorización' },
  { type: 'ci', title: 'Integración continua' },
  { type: 'docs', title: 'Documentación' },
  { type: 'feat', title: 'Novedades' },
  { type: 'chore', title: 'Tareas varias' },
  { type: 'perf', title: 'Mejoras de rendimiento' },
  { type: 'revert', title: 'Reversiones' },
  { type: 'style', title: 'Estilo' },
  { type: 'test', title: 'Pruebas' }
]

const BREAKING_TITLE = 'Cambios incompatibles'

/** Commits que no aportan al changelog aunque tengan un tipo válido. */
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

const KNOWN_TYPES = new Set(SECTIONS.map((s) => s.type))
const COMMIT_RE = /^(\w+)(?:\(([^)]*)\))?(!)?:\s+(.+)$/
const VERSION_HEADING_RE = /^#{1,2} (\d+\.\d+\.\d+)(?: |$)/

/**
 * Interpreta el asunto de un commit convencional.
 * Devuelve null si no sigue el formato o si el tipo no es conocido.
 */
export function parseCommit(subject) {
  const match = COMMIT_RE.exec(subject.trim())
  if (!match) return null
  const [, type, scope, bang, description] = match
  if (!KNOWN_TYPES.has(type)) return null
  return { type, scope: scope ?? '', breaking: bang === '!', description: description.trim() }
}

/** Decide si un commit ya interpretado se lista en el changelog. */
export function isListed(commit) {
  if (commit.type === 'chore' && /^bump\b/i.test(commit.description)) return false
  const lower = commit.description.toLowerCase()
  return !FILTER_KEYWORDS.some((keyword) => lower.includes(keyword))
}

function cleanDescription(description) {
  return description.replace(/,?\s*closes\s+#\w+/gi, '').trim()
}

function byScopeThenDescription(a, b) {
  return a.scope.localeCompare(b.scope) || a.description.localeCompare(b.description)
}

/** Las versiones patch usan `##` y las minor o major `#`, igual que el historial existente. */
export function headingFor(version, date) {
  const isPatch = Number(version.split('.')[2]) > 0
  return `${isPatch ? '##' : '#'} ${version} — ${date}`
}

/**
 * Arma la sección de una versión a partir de los asuntos de sus commits.
 * Devuelve null si ningún commit corresponde al changelog.
 */
export function buildSection(version, date, subjects) {
  const commits = subjects.map(parseCommit).filter((commit) => commit !== null && isListed(commit))

  if (commits.length === 0) return null

  const lines = [headingFor(version, date), '']

  const breaking = commits.filter((c) => c.breaking).sort(byScopeThenDescription)
  if (breaking.length > 0) {
    lines.push(`### ${BREAKING_TITLE}`, '')
    for (const commit of breaking) lines.push(`- ${cleanDescription(commit.description)}`)
    lines.push('')
  }

  for (const { type, title } of SECTIONS) {
    const group = commits.filter((c) => c.type === type).sort(byScopeThenDescription)
    if (group.length === 0) continue
    lines.push(`### ${title}`, '')
    for (const commit of group) lines.push(`- ${cleanDescription(commit.description)}`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Antepone la sección al changelog sin tocar las versiones anteriores.
 * Si la primera sección ya es de la misma versión (se volvió a correr el
 * script), la reemplaza en lugar de duplicarla.
 */
export function prependSection(existing, section, version) {
  const lines = existing.replace(/\r\n/g, '\n').split('\n')
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()

  const first = VERSION_HEADING_RE.exec(lines[0] ?? '')
  if (first && first[1] === version) {
    let next = 1
    while (next < lines.length && !VERSION_HEADING_RE.test(lines[next])) next++
    lines.splice(0, next)
  }

  const rest = lines.join('\n').replace(/\n+$/, '')
  return rest === ''
    ? `${section.replace(/\n+$/, '')}\n`
    : `${section.replace(/\n+$/, '')}\n\n${rest}\n`
}
