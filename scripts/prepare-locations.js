/**
 * Prepares the provinces/localities JSON for the app.
 *
 * Downloads official data from Argentina's Ministerio de Educación API,
 * filters out CABA barrios and component entities,
 * and writes a compact grouped JSON to src/renderer/src/data/.
 *
 * Run: node scripts/prepare-locations.js
 */

const https = require('https')
const fs = require('fs')
const path = require('path')

const PROVINCIAS_URL = 'https://datos.educacion.espinlabs.com.ar/files_api_geo/provincias.json'
const LOCALIDADES_URL = 'https://datos.educacion.espinlabs.com.ar/files_api_geo/localidades.json'
const OUTPUT = path.resolve(__dirname, '..', 'src/renderer/src/data/provincias-localidades.json')

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`))
          return
        }
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(new Error(`JSON parse error for ${url}: ${e.message}`))
          }
        })
      })
      .on('error', reject)
  })
}

async function main() {
  console.log('Downloading provincias...')
  const provinciasRaw = await fetchJson(PROVINCIAS_URL)
  const provincias = provinciasRaw.provincias

  console.log(`Downloading localidades (this may take a moment)...`)
  const localidadesRaw = await fetchJson(LOCALIDADES_URL)
  const localidades = localidadesRaw.localidades

  console.log(`  Received ${localidades.length} locality entries`)

  // Build province id -> name map
  const provMap = new Map()
  for (const p of provincias) {
    provMap.set(p.id, p.nombre)
  }

  // Group: provincia_id -> Set of locality names
  const grouped = new Map()

  for (const loc of localidades) {
    const pId = loc.provincia.id

    // CABA (id "02"): skip all — they're barrios, not localities
    if (pId === '02') continue

    // Only include "Localidad simple" — excludes components and entidades
    if (loc.categoria !== 'Localidad simple') continue

    const pName = provMap.get(pId) || loc.provincia.nombre
    if (!grouped.has(pId)) {
      grouped.set(pId, { nombre: pName, localidades: new Set() })
    }
    grouped
      .get(pId)
      .localidades.add(loc.nombre.charAt(0).toUpperCase() + loc.nombre.slice(1).toLowerCase())
  }

  // Manually add CABA as a single entry
  grouped.set('02', {
    nombre: 'Ciudad Autónoma de Buenos Aires',
    localidades: new Set(['Ciudad Autónoma de Buenos Aires'])
  })

  // Convert to sorted compact array
  const result = []
  const sortedIds = [
    '02',
    ...Array.from(grouped.keys())
      .filter((k) => k !== '02')
      .sort()
  ]
  for (const id of sortedIds) {
    const g = grouped.get(id)
    if (!g) continue
    const sortedLocalidades = Array.from(g.localidades).sort((a, b) => a.localeCompare(b, 'es'))
    result.push({
      n: g.nombre,
      l: sortedLocalidades
    })
  }

  const output = JSON.stringify(result)
  fs.writeFileSync(OUTPUT, output, 'utf-8')

  const totalLocalidades = result.reduce((sum, p) => sum + p.l.length, 0)
  const sizeKb = (Buffer.byteLength(output) / 1024).toFixed(1)
  console.log(`\nDone! Written to ${OUTPUT}`)
  console.log(`  Provinces: ${result.length}`)
  console.log(`  Localities: ${totalLocalidades}`)
  console.log(`  File size: ${sizeKb} KB`)
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
