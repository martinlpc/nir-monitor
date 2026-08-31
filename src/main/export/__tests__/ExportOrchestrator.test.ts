import { describe, expect, it, vi } from 'vitest'
import { ExportOrchestrator } from '../ExportOrchestator'
import type { ISessionRepository, SessionStats } from '../../../shared/services/ISessionRepository'
import type { IExporter, ExportContext } from '../IExporter'
import type { GeoTimestamp } from '../../../shared/GeoTimestamp'

const MAX_EXPORT_POINTS = 5000

function makePoint(seq: number): GeoTimestamp {
  return {
    id: `p${seq}`,
    sessionId: 'test-session',
    sequenceNumber: seq,
    timestamp: Date.now(),
    position: { lat: -38.95, lon: -68.06, alt: 271 },
    emf: { deviceId: 'nbm550', rawMeasurement: 5.0, unit: 'V/m' as const },
    correctedMeasurement: 5.0
  }
}

function makeFakeRepo(points: GeoTimestamp[]): ISessionRepository {
  const metadata = {
    id: 'test-session',
    label: 'Test',
    startedAt: Date.now() - 60000,
    stoppedAt: Date.now(),
    sampleCount: points.length,
    instrument: null,
    correctionFactor: null
  }
  const stats: SessionStats = {
    avgCorrected: 5.0,
    maxCorrected: 10.0,
    minCorrected: 1.0,
    pointCount: points.length
  }

  return {
    getSession: vi.fn().mockResolvedValue({ metadata, points }),
    getSessionStats: vi.fn().mockResolvedValue(stats),
    saveSession: vi.fn(),
    initSession: vi.fn(),
    addPoint: vi.fn(),
    finalizeSession: vi.fn(),
    flush: vi.fn(),
    listSessions: vi.fn().mockResolvedValue([]),
    deleteSession: vi.fn(),
    getSessionPoints: vi.fn().mockResolvedValue(points),
    getPointsInBounds: vi.fn().mockResolvedValue([])
  } as ISessionRepository
}

describe('ExportOrchestrator', () => {
  it('delegates to the correct exporter', async () => {
    const exporter: IExporter<string> = {
      export: vi.fn().mockResolvedValue('{"type":"FeatureCollection","features":[]}')
    }

    const repo = makeFakeRepo([])
    const orchestrator = new ExportOrchestrator(
      repo,
      new Map([['geojson', exporter]]),
      MAX_EXPORT_POINTS
    )

    const result = await orchestrator.export('test-session', 'geojson')

    expect(result.data).toBe('{"type":"FeatureCollection","features":[]}')
    expect(exporter.export).toHaveBeenCalledTimes(1)
    expect(repo.getSession).toHaveBeenCalledWith('test-session')
    expect(repo.getSessionStats).toHaveBeenCalledWith('test-session')
  })

  it('throws for unknown format', async () => {
    const repo = makeFakeRepo([])
    const orchestrator = new ExportOrchestrator(repo, new Map(), MAX_EXPORT_POINTS)

    await expect(orchestrator.export('test-session', 'unknown')).rejects.toThrow(
      'Unknown export format'
    )
  })

  it('throws when session not found', async () => {
    const repo = {
      ...makeFakeRepo([]),
      getSession: vi.fn().mockResolvedValue(null)
    }
    const orchestrator = new ExportOrchestrator(repo, new Map(), MAX_EXPORT_POINTS)

    await expect(orchestrator.export('missing', 'geojson')).rejects.toThrow(
      'Session missing not found'
    )
  })

  it('truncates points exceeding maxExportPoints', async () => {
    const excessivePoints = Array.from({ length: MAX_EXPORT_POINTS + 10 }, (_, i) => makePoint(i + 1))

    const repo = makeFakeRepo(excessivePoints)
    const exporter: IExporter<string> = {
      export: vi.fn().mockImplementation(async (ctx: ExportContext) => {
        return JSON.stringify({ count: ctx.points.length })
      })
    }

    const orchestrator = new ExportOrchestrator(
      repo,
      new Map([['geojson', exporter]]),
      MAX_EXPORT_POINTS
    )

    const result = await orchestrator.export('test-session', 'geojson')

    const parsed = JSON.parse(result.data as string)
    expect(parsed.count).toBe(MAX_EXPORT_POINTS)
    expect(result.truncated).toBe(true)
  })

  it('does not truncate when points are within limit', async () => {
    const points = Array.from({ length: 100 }, (_, i) => makePoint(i + 1))

    const repo = makeFakeRepo(points)
    const exporter: IExporter<string> = {
      export: vi.fn().mockImplementation(async (ctx: ExportContext) => {
        return JSON.stringify({ count: ctx.points.length })
      })
    }

    const orchestrator = new ExportOrchestrator(
      repo,
      new Map([['geojson', exporter]]),
      MAX_EXPORT_POINTS
    )

    const result = await orchestrator.export('test-session', 'geojson')

    const parsed = JSON.parse(result.data as string)
    expect(parsed.count).toBe(100)
    expect(result.truncated).toBeUndefined()
  })
})
