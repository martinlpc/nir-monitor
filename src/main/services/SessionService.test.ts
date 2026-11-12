import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import { SessionService } from './SessionService'
import { GeoFusionService } from './GeoFusionService'
import type { GeoPosition, GeoTimestamp } from '../../shared/GeoTimestamp'
import type { ISessionRepository } from '../../shared/services/ISessionRepository'
import type { CorrectionFactorResolver } from '../uncertainty/correctionFactor'
import type { NBM550ProbeInfo } from '../devices/nbm550/nbm550.types'
import { AppError } from '../../shared/errors/AppError'

class FakeNBMDriver extends EventEmitter {
  private connected = true

  connectState(connected: boolean): void {
    this.connected = connected
  }

  isConnected(): boolean {
    return this.connected
  }

  resetMaxHold(): Promise<void> {
    return Promise.resolve()
  }

  getProbeInfo(): NBM550ProbeInfo | null {
    return null
  }

  getDeviceInfo(): null {
    return null
  }

  getMeterSerial(): null {
    return null
  }

  readMeasurement(): Promise<{ rss: number; unit: 'V/m'; battery: number }> {
    return Promise.resolve({ rss: 6.5, unit: 'V/m', battery: 100 })
  }
}

class ProbeNBMDriver extends FakeNBMDriver {
  getProbeInfo(): { model: string; serial: string | null; calibrationDate: string | null } {
    return { model: 'EF0391', serial: 'S123', calibrationDate: '2025-01-01' }
  }
}

class NBM100ResetErrorDriver extends FakeNBMDriver {
  resetMaxHold(): Promise<void> {
    return Promise.reject(
      new AppError({
        code: 'NBM_100',
        message: 'código 100',
        severity: 'warning',
        category: 'nbm',
        userAction: 'ninguna'
      })
    )
  }
}

class GenericResetErrorDriver extends FakeNBMDriver {
  resetMaxHold(): Promise<void> {
    return Promise.reject(new Error('device busy'))
  }
}

type FakeRepository = {
  saveSession: ReturnType<typeof vi.fn>
  initSession: ReturnType<typeof vi.fn>
  addPoint: ReturnType<typeof vi.fn>
  finalizeSession: ReturnType<typeof vi.fn>
  flush: ReturnType<typeof vi.fn>
  getSession: ReturnType<typeof vi.fn>
  listSessions: ReturnType<typeof vi.fn>
  deleteSession: ReturnType<typeof vi.fn>
  getSessionPoints: ReturnType<typeof vi.fn>
  getSessionStats: ReturnType<typeof vi.fn>
  getPointsInBounds: ReturnType<typeof vi.fn>
}

function createFakeRepo(): FakeRepository {
  return {
    saveSession: vi.fn(async () => {}),
    initSession: vi.fn(async () => {}),
    addPoint: vi.fn(async () => {}),
    finalizeSession: vi.fn(async () => {}),
    flush: vi.fn(),
    getSession: vi.fn(async () => null),
    listSessions: vi.fn(async () => []),
    deleteSession: vi.fn(async () => {}),
    getSessionPoints: vi.fn(async () => []),
    getSessionStats: vi.fn(async () => null),
    getPointsInBounds: vi.fn(async () => [])
  }
}

function asRepo(repo: FakeRepository): ISessionRepository {
  return repo as unknown as ISessionRepository
}

function asResolver(resolve: (model: string | null) => number | null): CorrectionFactorResolver {
  return { resolve } as unknown as CorrectionFactorResolver
}

class FakeGPSDriver extends EventEmitter {
  private connected = true
  private position: GeoPosition | null = null
  private valid = false

  connectState(connected: boolean): void {
    this.connected = connected
  }

  isConnected(): boolean {
    return this.connected
  }

  setPosition(position: GeoPosition, valid = true): void {
    this.position = position
    this.valid = valid
  }

  getLastPosition(): GeoPosition | null {
    return this.position
  }

  isPositionValid(): boolean {
    return this.valid
  }

  emitPosition(): void {
    this.emit('position', this.position, this.valid)
  }
}

describe('SessionService', () => {
  it('requires both devices to be connected before starting', async () => {
    const fusion = new GeoFusionService()
    const session = new SessionService(fusion)
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()

    nbm.connectState(false)
    session.setNBM(nbm as never)
    session.setGPS(gps as never)

    await expect(session.start()).rejects.toThrow('NBM-550 no conectado')
  })

  it('starts a session and counts captured points', async () => {
    const fusion = new GeoFusionService()
    const session = new SessionService(fusion)
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()

    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 22 })

    session.setNBM(nbm as never)
    session.setGPS(gps as never)

    const sessionId = await session.start('Recorrido de prueba', {
      triggerMode: 'distance',
      minDistanceMeters: 1
    })
    const pointPromise = new Promise<GeoTimestamp>((resolve) => session.once('point', resolve))

    gps.emitPosition()
    const point = await pointPromise

    expect(point.sessionId).toBe(sessionId)
    expect(session.getState()).toBe('running')

    const summary = await session.stop()

    expect(summary.id).toBe(sessionId)
    expect(summary.label).toBe('Recorrido de prueba')
    expect(summary.sampleCount).toBe(1)
    expect(session.getState()).toBe('stopped')
  })

  // ── Estado y helpers ─────────────────────────────────────

  it('exposes state helpers before and during a session', async () => {
    const repo = createFakeRepo()
    const session = new SessionService(
      new GeoFusionService(),
      asRepo(repo),
      undefined,
      asResolver(() => 1.1)
    )
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 22 })

    expect(session.getCurrentSessionId()).toBeNull()
    expect(session.getSummary()).toBeNull()
    expect(session.hasPendingFinalize()).toBe(false)
    expect(session.getRepository()).toBe(asRepo(repo))

    session.setNBM(nbm as never)
    session.setGPS(gps as never)

    const sessionId = await session.start('Helpers', {
      triggerMode: 'distance',
      minDistanceMeters: 1
    })

    expect(session.getCurrentSessionId()).toBe(sessionId)
    const summary = session.getSummary()
    expect(summary).not.toBeNull()
    expect(summary?.id).toBe(sessionId)
    expect(summary?.stoppedAt).toBeNull()

    const repo2 = createFakeRepo()
    session.setRepository(asRepo(repo2))
    expect(session.getRepository()).toBe(asRepo(repo2))
  })

  it('throws when stopping a session that is not running', async () => {
    const session = new SessionService(new GeoFusionService())
    await expect(session.stop()).rejects.toThrow('No hay sesión en curso')
  })

  // ── Persistencia con repositorio ─────────────────────────

  it('initializes, persists points and finalizes a session in the repository', async () => {
    const repo = createFakeRepo()
    const session = new SessionService(
      new GeoFusionService(),
      asRepo(repo),
      undefined,
      asResolver(() => 1.1)
    )
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 22 })

    session.setNBM(nbm as never)
    session.setGPS(gps as never)

    const sessionId = await session.start('Repo session', {
      triggerMode: 'distance',
      minDistanceMeters: 1
    })

    const pointPromise = new Promise<GeoTimestamp>((resolve) => session.once('point', resolve))
    gps.emitPosition()
    const point = await pointPromise
    await new Promise((r) => setTimeout(r, 10))

    expect(repo.initSession).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({ id: sessionId })
    )
    expect(repo.addPoint).toHaveBeenCalledWith(sessionId, point)

    const summary = await session.stop()
    expect(repo.finalizeSession).toHaveBeenCalledWith(sessionId, summary)
    expect(session.hasPendingFinalize()).toBe(false)
  })

  it('retries a failed point save before succeeding', async () => {
    const repo = createFakeRepo()
    repo.addPoint.mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined)
    const session = new SessionService(
      new GeoFusionService(),
      asRepo(repo),
      undefined,
      asResolver(() => 1.1)
    )
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 22 })

    session.setNBM(nbm as never)
    session.setGPS(gps as never)
    await session.start('Retry session', { triggerMode: 'distance', minDistanceMeters: 1 })

    const saveErrorListener = vi.fn()
    session.on('session:saveError', saveErrorListener)

    const pointPromise = new Promise<GeoTimestamp>((resolve) => session.once('point', resolve))
    gps.emitPosition()
    await pointPromise
    await new Promise((r) => setTimeout(r, 500))

    expect(repo.addPoint).toHaveBeenCalledTimes(2)
    expect(saveErrorListener).not.toHaveBeenCalled()
  })

  it('emits session:saveError after exhausting point save retries', async () => {
    const repo = createFakeRepo()
    repo.addPoint.mockRejectedValue(new Error('db down'))
    const session = new SessionService(
      new GeoFusionService(),
      asRepo(repo),
      undefined,
      asResolver(() => 1.1)
    )
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 22 })

    session.setNBM(nbm as never)
    session.setGPS(gps as never)
    await session.start('Retry fail', { triggerMode: 'distance', minDistanceMeters: 1 })

    const saveErrorPromise = new Promise<{ sessionId: string }>((resolve) =>
      session.once('session:saveError', resolve)
    )
    gps.emitPosition()
    const payload = await saveErrorPromise

    expect(payload.sessionId).toBe(session.getCurrentSessionId())
    expect(session.hasPendingFinalize()).toBe(false)
  })

  it('throws SESSION_NO_CORRECTION_FACTOR when no factor resolves for the probe', async () => {
    const repo = createFakeRepo()
    const session = new SessionService(
      new GeoFusionService(),
      asRepo(repo),
      undefined,
      asResolver(() => null)
    )
    const nbm = new ProbeNBMDriver()
    const gps = new FakeGPSDriver()
    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 22 })

    session.setNBM(nbm as never)
    session.setGPS(gps as never)

    try {
      await session.start('No factor', { triggerMode: 'distance', minDistanceMeters: 1 })
      throw new Error('expected start to fail')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('SESSION_NO_CORRECTION_FACTOR')
    }
    expect(session.getState()).toBe('idle')
  })

  it('throws SESSION_INIT_FAILED when the repository cannot initialize the session', async () => {
    const repo = createFakeRepo()
    repo.initSession.mockRejectedValue(new Error('disk full'))
    const session = new SessionService(
      new GeoFusionService(),
      asRepo(repo),
      undefined,
      asResolver(() => 1.1)
    )
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 22 })

    session.setNBM(nbm as never)
    session.setGPS(gps as never)

    try {
      await session.start('Init fail', { triggerMode: 'distance', minDistanceMeters: 1 })
      throw new Error('expected start to fail')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('SESSION_INIT_FAILED')
    }
    expect(session.getState()).toBe('idle')
  })

  it('stops and alerts when a probe factor is missing mid-session', async () => {
    const session = new SessionService(
      new GeoFusionService(),
      undefined,
      undefined,
      asResolver(() => null)
    )
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 22 })

    session.setNBM(nbm as never)
    session.setGPS(gps as never)
    await session.start('Alert test', { triggerMode: 'distance', minDistanceMeters: 1 })

    const alertPromise = new Promise<{ message: string }>((resolve) =>
      session.once('alert', resolve)
    )
    session.setNBM(new ProbeNBMDriver() as never)
    const alert = await alertPromise

    expect(alert.message).toContain('EF0391')
    expect(session.getState()).toBe('stopped')
  })

  it('treats resetMaxHold NBM_100 as a normal non-fatal error', async () => {
    const session = new SessionService(new GeoFusionService())
    const nbm = new NBM100ResetErrorDriver()
    const gps = new FakeGPSDriver()
    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 22 })

    session.setNBM(nbm as never)
    session.setGPS(gps as never)

    await expect(
      session.start('Code 100', { triggerMode: 'distance', minDistanceMeters: 1 })
    ).resolves.toBeTruthy()
  })

  it('treats a generic resetMaxHold failure as non-fatal', async () => {
    const session = new SessionService(new GeoFusionService())
    const nbm = new GenericResetErrorDriver()
    const gps = new FakeGPSDriver()
    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 22 })

    session.setNBM(nbm as never)
    session.setGPS(gps as never)

    await expect(
      session.start('Generic reset', { triggerMode: 'distance', minDistanceMeters: 1 })
    ).resolves.toBeTruthy()
  })

  it('sets pendingFinalize when finalizeSession fails', async () => {
    const repo = createFakeRepo()
    repo.finalizeSession.mockRejectedValue(new Error('db down'))
    const session = new SessionService(
      new GeoFusionService(),
      asRepo(repo),
      undefined,
      asResolver(() => 1.1)
    )
    const nbm = new FakeNBMDriver()
    const gps = new FakeGPSDriver()
    gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 22 })

    session.setNBM(nbm as never)
    session.setGPS(gps as never)
    await session.start('Finalize fail', { triggerMode: 'distance', minDistanceMeters: 1 })

    const saveErrorPromise = new Promise((resolve) => session.once('session:saveError', resolve))
    const summary = await session.stop()
    await saveErrorPromise

    expect(summary.sampleCount).toBe(0)
    expect(session.hasPendingFinalize()).toBe(true)
  })
})

class FakeFusion extends EventEmitter {
  stop = vi.fn()
  start = vi.fn()
  setNBM = vi.fn()
  setGPS = vi.fn()
  setCorrectionFactor = vi.fn()
  updateConfig = vi.fn()
  onGPSPosition = vi.fn()

  emitPoint(seq: number): void {
    const point: GeoTimestamp = {
      id: `p-${seq}`,
      sessionId: 's',
      sequenceNumber: seq,
      timestamp: 1_700_000_000_000 + seq * 1000,
      position: { lat: -34.6, lon: -58.38, alt: 22 },
      emf: { deviceId: 'nbm550', rawMeasurement: 1, unit: 'V/m' },
      correctedMeasurement: 1.1
    }
    this.emit('point', point)
  }
}

const flushAsync = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

async function startedSession(
  repo: FakeRepository,
  maxPoints?: number
): Promise<{ session: SessionService; fusion: FakeFusion }> {
  const fusion = new FakeFusion()
  const session = new SessionService(
    fusion as never,
    asRepo(repo),
    undefined,
    asResolver(() => 1.1),
    maxPoints === undefined ? undefined : { maxPoints }
  )
  const gps = new FakeGPSDriver()
  gps.setPosition({ lat: -34.6037, lon: -58.3816, alt: 22 })
  session.setNBM(new FakeNBMDriver() as never)
  session.setGPS(gps as never)
  await session.start('Limit test')
  return { session, fusion }
}

describe('SessionService point limit and save failures', () => {
  it('stops the session by itself when the point limit is reached', async () => {
    const repo = createFakeRepo()
    const { session, fusion } = await startedSession(repo, 2)
    const alerts: { message: string; severity?: string }[] = []
    const autoStopped = vi.fn()
    session.on('alert', (a) => alerts.push(a))
    session.on('autoStopped', autoStopped)

    fusion.emitPoint(1)
    fusion.emitPoint(2)
    fusion.emitPoint(3)
    await flushAsync()

    expect(repo.addPoint).toHaveBeenCalledTimes(2)
    expect(repo.finalizeSession).toHaveBeenCalledOnce()
    expect(session.getState()).toBe('stopped')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].severity).toBe('warning')
    expect(alerts[0].message).toContain('límite de 2 puntos')
    expect(autoStopped).toHaveBeenCalledWith(expect.objectContaining({ sampleCount: 2 }))
  })

  it('saves the last allowed point before finalizing', async () => {
    const repo = createFakeRepo()
    const order: string[] = []
    repo.addPoint.mockImplementation(async (_id: string, p: GeoTimestamp) => {
      await flushAsync()
      order.push(`add:${p.sequenceNumber}`)
    })
    repo.finalizeSession.mockImplementation(async () => {
      order.push('finalize')
    })
    const { fusion } = await startedSession(repo, 1)

    fusion.emitPoint(1)
    await new Promise((r) => setTimeout(r, 20))

    expect(order).toEqual(['add:1', 'finalize'])
  })

  it('allows a new session to capture again after hitting the limit', async () => {
    const repo = createFakeRepo()
    const { session, fusion } = await startedSession(repo, 1)
    fusion.emitPoint(1)
    await flushAsync()
    expect(session.getState()).toBe('stopped')

    await session.start('Second run')
    fusion.emitPoint(1)
    await flushAsync()

    expect(repo.addPoint).toHaveBeenCalledTimes(2)
  })

  it('does not retry a non-retryable save error', async () => {
    const repo = createFakeRepo()
    repo.addPoint.mockRejectedValue(
      new AppError({
        code: 'SESSION_POINT_LIMIT',
        message: 'Límite alcanzado',
        severity: 'warning',
        category: 'session',
        retryable: false
      })
    )
    const { session, fusion } = await startedSession(repo)
    const saveError = vi.fn()
    session.on('session:saveError', saveError)

    fusion.emitPoint(1)
    await flushAsync()

    expect(repo.addPoint).toHaveBeenCalledTimes(1)
    expect(saveError).toHaveBeenCalledOnce()
  })

  it('alerts the user only once per session when saves keep failing', async () => {
    const repo = createFakeRepo()
    repo.addPoint.mockRejectedValue(
      new AppError({
        code: 'DISK_FULL',
        message: 'ENOSPC',
        severity: 'error',
        category: 'session',
        retryable: false
      })
    )
    const { session, fusion } = await startedSession(repo)
    const alerts: { message: string; severity?: string }[] = []
    const saveError = vi.fn()
    session.on('alert', (a) => alerts.push(a))
    session.on('session:saveError', saveError)

    fusion.emitPoint(1)
    fusion.emitPoint(2)
    fusion.emitPoint(3)
    await flushAsync()

    expect(saveError).toHaveBeenCalledTimes(3)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].severity).toBe('error')
    expect(alerts[0].message).toContain('No se pudo guardar')
    expect(session.getState()).toBe('running')
  })

  it('alerts when the session cannot be finalized', async () => {
    const repo = createFakeRepo()
    repo.finalizeSession.mockRejectedValue(new Error('disk full'))
    const { session } = await startedSession(repo)
    const alerts: { message: string }[] = []
    session.on('alert', (a) => alerts.push(a))

    await session.stop()

    expect(alerts).toHaveLength(1)
    expect(alerts[0].message).toContain('No se pudo cerrar la sesión')
    expect(session.hasPendingFinalize()).toBe(true)
  })
})
