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
import { v4 as uuidv4 } from 'uuid'
import type { GeoTimestamp, GeoPosition } from '../../shared/GeoTimestamp'
import type { SessionSummary } from '../../shared/ipc.types'
import { SQLiteSessionRepository } from '../services/SQLiteSessionRepository'

// --- Generador de sesiones mock ---
const NEUQUEN_CENTER: GeoPosition = {
  lat: -38.9516,
  lon: -68.0591,
  alt: 271
}

const ROUTES = [
  {
    name: 'Recorrido Ruta 9 Norte',
    startOffset: { lat: 0.05, lon: -0.02 },
    endOffset: { lat: 0.08, lon: 0 },
    daysAgo: 7,
    minRss: 3.5,
    maxRss: 7.2
  },
  {
    name: 'Medición Centro - Pellegrini',
    startOffset: { lat: 0, lon: 0.02 },
    endOffset: { lat: -0.02, lon: 0.04 },
    daysAgo: 5,
    minRss: 2.1,
    maxRss: 5.8
  },
  {
    name: 'Ruta sur hacia Río Negro',
    startOffset: { lat: -0.06, lon: -0.01 },
    endOffset: { lat: -0.1, lon: 0.01 },
    daysAgo: 3,
    minRss: 4.2,
    maxRss: 8.5
  },
  {
    name: 'Avenida Argentina Este',
    startOffset: { lat: 0.01, lon: 0.05 },
    endOffset: { lat: 0.03, lon: 0.08 },
    daysAgo: 2,
    minRss: 2.8,
    maxRss: 6.1
  },
  {
    name: 'Zona industrial Oeste',
    startOffset: { lat: -0.02, lon: -0.08 },
    endOffset: { lat: 0.02, lon: -0.12 },
    daysAgo: 1,
    minRss: 5.5,
    maxRss: 9.3
  },
  {
    name: 'Circuito urbano general',
    startOffset: { lat: 0.04, lon: -0.04 },
    endOffset: { lat: -0.04, lon: 0.04 },
    daysAgo: 0.5,
    minRss: 3.0,
    maxRss: 7.5
  }
]

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a)
}
function interpolatePoint(start: GeoPosition, end: GeoPosition, progress: number): GeoPosition {
  return {
    lat: start.lat + (end.lat - start.lat) * progress,
    lon: start.lon + (end.lon - start.lon) * progress,
    alt: start.alt + (end.alt - start.alt) * progress
  }
}
function generateRss(minRss: number, maxRss: number, progress: number, variation: number): number {
  const baseRss = minRss + (maxRss - minRss) * Math.sin(progress * Math.PI)
  const randomVariation = (Math.random() - 0.5) * variation
  return Math.max(minRss * 0.8, Math.min(maxRss * 1.2, baseRss + randomVariation))
}
function generateMockSession(routeIndex: number): {
  metadata: SessionSummary
  points: GeoTimestamp[]
} {
  const route = ROUTES[routeIndex]
  const sessionId = uuidv4()
  const startTime =
    Date.now() - route.daysAgo * 24 * 60 * 60 * 1000 + Math.random() * 2 * 60 * 60 * 1000
  const duration = 45 * 60 * 1000
  const startPos: GeoPosition = {
    lat: NEUQUEN_CENTER.lat + route.startOffset.lat,
    lon: NEUQUEN_CENTER.lon + route.startOffset.lon,
    alt: NEUQUEN_CENTER.alt
  }
  const endPos: GeoPosition = {
    lat: NEUQUEN_CENTER.lat + route.endOffset.lat,
    lon: NEUQUEN_CENTER.lon + route.endOffset.lon,
    alt: NEUQUEN_CENTER.alt
  }
  const correctionFactor = 1.0 + Math.random() * 0.15
  const pointCount = 18 + Math.floor(Math.random() * 12)
  const points: GeoTimestamp[] = []
  for (let i = 0; i < pointCount; i++) {
    const progress = i / (pointCount - 1)
    const timestamp = startTime + duration * progress
    const position = interpolatePoint(startPos, endPos, progress)
    const rss = generateRss(
      route.minRss,
      route.maxRss,
      progress,
      (route.maxRss - route.minRss) * 0.3
    )
    const rssWithUncertainty = rss * correctionFactor
    points.push({
      id: uuidv4(),
      sessionId,
      sequenceNumber: i + 1,
      timestamp: Math.round(timestamp),
      position,
      emf: { deviceId: 'nbm550', rss: Math.round(rss * 100) / 100, unit: 'V/m' },
      rssWithUncertainty: Math.round(rssWithUncertainty * 100) / 100
    })
  }
  const metadata: SessionSummary = {
    id: sessionId,
    label: route.name,
    startedAt: Math.round(startTime),
    stoppedAt: Math.round(startTime + duration),
    sampleCount: pointCount,
    instrument: {
      meter: {
        brand: 'Narda',
        model: 'NBM-550',
        serial: `SN-${1000 + routeIndex}`,
        lastCalibrationDate: '2025-12-15T00:00:00Z'
      },
      probe: {
        brand: 'Narda',
        model: 'EF0391',
        serial: `PROBE-${2000 + routeIndex}`,
        calibrationDate: '2025-12-15T00:00:00Z'
      }
    },
    correctionFactor: Math.round(correctionFactor * 10000) / 10000
  }
  return { metadata, points }
}
function generateAllMockSessions() {
  return ROUTES.map((_, index) => generateMockSession(index))
}

async function seedDatabase() {
  console.log('🌱 Iniciando seed de sesiones mock (con instrument)...')
  try {
    const dataPath =
      process.platform === 'win32'
        ? path.join(process.env.APPDATA || os.homedir(), 'nir-monitor')
        : path.join(os.homedir(), '.config', 'nir-monitor')

    console.log(`   📁 Usando ruta: ${dataPath}`)

    const repository = new SQLiteSessionRepository()
    const sessions = generateAllMockSessions()

    for (let i = 0; i < sessions.length; i++) {
      const { metadata, points } = sessions[i]
      console.log(
        `\n📍 Guardando sesión ${i + 1}/${sessions.length}: "${metadata.label}" (${points.length} puntos)`
      )

      try {
        await repository.initSession(metadata.id, metadata)
        console.log(`   ✓ Sesión inicializada`)
        for (const point of points) {
          await repository.addPoint(metadata.id, point)
        }
        console.log(`   ✓ ${points.length} puntos agregados`)
        await repository.finalizeSession(metadata.id, metadata)
        console.log(`   ✓ Sesión finalizada`)
      } catch (err) {
        console.error(`   ✗ Error guardando sesión: ${err}`)
      }
    }

    console.log(`\n✅ Seed completado! ${sessions.length} sesiones mock guardadas en la DB.`)
    console.log(`   📁 Ruta: ${dataPath}/sessions.db`)
    console.log('   Inicia la app con: npm run dev')
    process.exit(0)
  } catch (err) {
    console.error('❌ Error fatal:', err)
    process.exit(1)
  }
}

seedDatabase()
