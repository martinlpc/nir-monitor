// Agrega al CHANGELOG.md la sección de la versión actual de package.json.
//
// Es incremental: solo genera la versión nueva, con los commits posteriores al
// último tag, y la antepone al archivo. Las versiones anteriores no se tocan,
// así que las ediciones hechas a mano se conservan.
//
// Uso (después de actualizar "version" en package.json y antes de taggear):
//   npm run changelog
import { execFileSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { buildSection, prependSection } from './changelog-lib.mjs'

const CHANGELOG_PATH = 'CHANGELOG.md'

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf-8' }).trim()
}

function lastTag() {
  try {
    return git('describe', '--tags', '--abbrev=0')
  } catch {
    return null
  }
}

function localDate() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const { version } = JSON.parse(readFileSync('package.json', 'utf-8'))
const tag = lastTag()

if (tag === `v${version}`) {
  console.error(
    `La versión ${version} ya está taggeada (${tag}). Actualice "version" en package.json antes de generar el changelog.`
  )
  process.exit(1)
}

const range = tag ? [`${tag}..HEAD`] : []
const subjects = git('log', '--no-merges', '--format=%s', ...range)
  .split('\n')
  .filter(Boolean)

const section = buildSection(version, localDate(), subjects)
if (!section) {
  console.error(
    `No hay commits para listar desde ${tag ?? 'el inicio del repositorio'}. CHANGELOG.md no se modificó.`
  )
  process.exit(1)
}

const existing = existsSync(CHANGELOG_PATH) ? readFileSync(CHANGELOG_PATH, 'utf-8') : ''
writeFileSync(CHANGELOG_PATH, prependSection(existing, section, version), 'utf-8')
console.log(`CHANGELOG.md: sección ${version} generada (${tag ?? 'inicio'}..HEAD)`)
