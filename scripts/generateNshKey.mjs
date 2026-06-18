import 'dotenv/config'
import { writeFileSync } from 'node:fs'

const key = process.env.NIR_DB_ENCRYPTION_KEY

if (!key) {
  console.error(
    'ERROR: NIR_DB_ENCRYPTION_KEY no está definida.\n' +
      'Asegúrate de tener un archivo .env en la raíz del proyecto con:\n' +
      '  NIR_DB_ENCRYPTION_KEY=<passphrase>'
  )
  process.exit(1)
}

writeFileSync('build/key.nsh', `!define NIR_DB_ENCRYPTION_KEY "${key}"\n`)
console.log('✓ build/key.nsh generated')
