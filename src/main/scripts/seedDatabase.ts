/**
 * Script CLI para poblar la DB con sesiones mock
 * Ejecutar: npm run seed:mock
 *
 * Nota: Este script usa SQLiteSessionRepository que intenta usar app.getPath('userData')
 * Si falla (en script standalone), cae a .data/ como fallback.
 * Para dev, aseguramos la ruta correcta manualmente.
 */

import path from 'path'
import os from 'os'
import { generateAllMockSessions } from './seedMockSessions'
import { SQLiteSessionRepository } from '../services/SQLiteSessionRepository'

async function seedDatabase() {
  console.log('🌱 Iniciando seed de sesiones mock...')

  try {
    // En Windows, usa AppData\Roaming; en Unix, usa .config
    const dataPath =
      process.platform === 'win32'
        ? path.join(process.env.APPDATA || os.homedir(), 'nir-monitor')
        : path.join(os.homedir(), '.config', 'nir-monitor')

    console.log(`   📁 Usando ruta: ${dataPath}`)

    const repository = new SQLiteSessionRepository()
    const sessions = generateAllMockSessions()

    for (let i = 0; i < sessions.length; i++) {
      const { metadata, points } = sessions[i]
      console.log(`\n📍 Guardando sesión ${i + 1}/6: "${metadata.label}" (${points.length} puntos)`)

      try {
        // Primero guardar la sesión (metadata)
        await repository.initSession(metadata.id, metadata)
        console.log(`   ✓ Sesión inicializada`)

        // Luego agregar cada punto
        for (const point of points) {
          await repository.addPoint(metadata.id, point)
        }
        console.log(`   ✓ ${points.length} puntos agregados`)

        // Finalizar sesión
        await repository.finalizeSession(metadata.id, metadata)
        console.log(`   ✓ Sesión finalizada`)
      } catch (err) {
        console.error(`   ✗ Error guardando sesión: ${err}`)
      }
    }

    console.log('\n✅ Seed completado! 6 sesiones mock guardadas en la DB.')
    console.log(`   📁 Ruta: ${dataPath}/sessions.db`)
    console.log('   Inicia la app con: npm run dev')

    process.exit(0)
  } catch (err) {
    console.error('❌ Error fatal:', err)
    process.exit(1)
  }
}

seedDatabase()
