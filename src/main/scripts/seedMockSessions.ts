import { v4 as uuidv4 } from 'uuid'
import type { GeoTimestamp, GeoPosition } from '../../shared/GeoTimestamp'
import type { SessionSummary } from '../../shared/ipc.types'

/**
 * Script para generar 6 sesiones mock alrededor de Neuquén, Argentina
 * para testing de la UI
 */

// Neuquén centro: -38.9516, -68.0591
const NEUQUEN_CENTER: GeoPosition = {
  lat: -38.9516,
  lon: -68.0591,
  alt: 271 // elevación de Neuquén
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
    daysAgo: 0.5, // hace 12 horas
    minRss: 3.0,
    maxRss: 7.5
  }
]

/**
 * Interpolar punto entre dos coordenadas
 */
function interpolatePoint(start: GeoPosition, end: GeoPosition, progress: number): GeoPosition {
  return {
    lat: start.lat + (end.lat - start.lat) * progress,
    lon: start.lon + (end.lon - start.lon) * progress,
    alt: start.alt + (end.alt - start.alt) * progress
  }
}

/**
 * Generar valor EMF variable con tendencias realistas
 */
function generateRss(minRss: number, maxRss: number, progress: number, variation: number): number {
  // Curva sinusoidal para simular variaciones naturales
  const baseRss = minRss + (maxRss - minRss) * Math.sin(progress * Math.PI)
  const randomVariation = (Math.random() - 0.5) * variation
  return Math.max(minRss * 0.8, Math.min(maxRss * 1.2, baseRss + randomVariation))
}

/**
 * Crear una sesión mock con sus puntos
 */
export function generateMockSession(routeIndex: number): {
  metadata: SessionSummary
  points: GeoTimestamp[]
} {
  const route = ROUTES[routeIndex]
  const sessionId = uuidv4()

  // Fecha de inicio: N días atrás
  const startTime =
    Date.now() - route.daysAgo * 24 * 60 * 60 * 1000 + Math.random() * 2 * 60 * 60 * 1000
  const duration = 45 * 60 * 1000 // 45 minutos por sesión

  // Calcular inicio y fin
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

  // Factor de corrección por sesión
  const uncertaintyFactor = 1.0 + Math.random() * 0.15 // 0-15% de corrección

  // Generar puntos
  const pointCount = 18 + Math.floor(Math.random() * 12) // 18-30 puntos
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
    const rssWithUncertainty = rss * uncertaintyFactor

    points.push({
      id: uuidv4(),
      sessionId,
      sequenceNumber: i + 1,
      timestamp: Math.round(timestamp),
      position,
      emf: {
        deviceId: 'nbm550',
        rss: Math.round(rss * 100) / 100, // 2 decimales
        unit: 'V/m'
      },
      rssWithUncertainty: Math.round(rssWithUncertainty * 100) / 100
    })
  }

  // Metadata
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
    uncertainty: Math.round((uncertaintyFactor - 1) * 100) // % de corrección
  }

  return { metadata, points }
}

/**
 * Generar todas las 6 sesiones mock
 */
export function generateAllMockSessions(): Array<{
  metadata: SessionSummary
  points: GeoTimestamp[]
}> {
  return ROUTES.map((_, index) => generateMockSession(index))
}

console.log('Mock sessions generator loaded. Use: generateAllMockSessions()')
