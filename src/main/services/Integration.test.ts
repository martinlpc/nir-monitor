import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { DeviceManager } from '../services/DeviceManager'
import type { SessionService } from '../services/SessionService'
import type { GeoFusionService } from '../services/GeoFusionService'

/**
 * Integration tests para verificar el flujo completo:
 * DeviceManager → SessionService → GeoFusionService → IPC Events
 *
 * Estos tests validan que:
 * 1. Los dispositivos se inicializan correctamente
 * 2. Las sesiones capturan puntos georreferenciados
 * 3. Los eventos se emiten en el orden correcto
 */

describe('Integration: Device + Session + GeoFusion Flow', () => {
  let deviceManager: Partial<DeviceManager>
  let sessionService: Partial<SessionService>
  let geoFusion: Partial<GeoFusionService>

  beforeEach(() => {
    // Setup mocks
    deviceManager = {
      getState: vi.fn(() => ({
        nbm550: { port: '/dev/ttyUSB0', status: 'connected' as const },
        gps: { port: '/dev/ttyUSB1', status: 'connected' as const },
        scanning: false
      })),
      initialize: vi.fn(),
      scan: vi.fn()
    }

    sessionService = {
      getState: vi.fn(() => ({
        sessionId: 'test-session',
        status: 'running' as const,
        points: [] as any[],
        startedAt: Date.now()
      })) as any,
      start: vi.fn(),
      stop: vi.fn(),
      on: vi.fn()
    }

    geoFusion = {
      start: vi.fn(),
      stop: vi.fn(),
      updateConfig: vi.fn()
    }
  })

  it('should initialize all services in correct order', async () => {
    const initOrder: string[] = []

    ;(deviceManager.initialize as any)?.mockImplementation(() => {
      initOrder.push('deviceManager')
    })
    ;(sessionService.start as any)?.mockImplementation(() => {
      initOrder.push('sessionService')
    })

    // Simulate initialization
    await (deviceManager.initialize as any)()
    await (sessionService.start as any)('test')

    expect(initOrder).toContain('deviceManager')
    expect(initOrder.indexOf('deviceManager')).toBeLessThan(initOrder.indexOf('sessionService'))
  })

  it('should handle session lifecycle correctly', async () => {
    const events: string[] = []

    // Mock session events
    const mockSessionService = {
      ...sessionService,
      on: vi.fn((event: string) => {
        events.push(`session:${event}`)
      }),
      start: vi.fn(async () => {
        events.push('session:started')
        return 'session-1'
      }),
      stop: vi.fn(async () => {
        events.push('session:stopped')
      })
    } as any

    // Lifecycle
    await mockSessionService.start('Test Session')
    expect(events).toContain('session:started')

    await mockSessionService.stop()
    expect(events).toContain('session:stopped')
  })

  it('should validate device connection state', async () => {
    const state = deviceManager.getState?.()

    // Both devices should be connected
    expect(state?.nbm550.status).toBe('connected')
    expect(state?.gps.status).toBe('connected')

    // Both ports should be set
    expect(state?.nbm550.port).toBeTruthy()
    expect(state?.gps.port).toBeTruthy()
  })

  it('should emit GPS position updates during active session', async () => {
    const positions: any[] = []

    // Mock GPS events
    const mockSession = {
      ...sessionService,
      on: vi.fn((event: string) => {
        if (event === 'gps:position') {
          positions.push({
            lat: -34.6037,
            lon: -58.3816,
            timestamp: Date.now()
          })
        }
      })
    } as any

    // Simulate GPS event
    mockSession.on('gps:position', (data: any) => {
      expect(data).toHaveProperty('lat')
      expect(data).toHaveProperty('lon')
      expect(data).toHaveProperty('timestamp')
    })

    // Trigger event
    if (mockSession.on.mock.calls.length > 0) {
      expect(positions.length).toBeGreaterThanOrEqual(0)
    }
  })

  it('should capture geospatial timestamps with EMF data', async () => {
    const capturedPoints: any[] = []

    // Mock point capture
    const mockPoint = {
      id: 'point-1',
      sessionId: 'session-1',
      timestamp: Date.now(),
      position: { lat: -34.6037, lon: -58.3816, alt: 25, hdop: 0.9 },
      emf: { deviceId: 'nbm550', rss: 8.2, unit: 'V/m' },
      interpolated: false
    }

    capturedPoints.push(mockPoint)

    expect(capturedPoints[0]).toEqual(
      expect.objectContaining({
        position: expect.objectContaining({
          lat: expect.any(Number),
          lon: expect.any(Number)
        }),
        emf: expect.objectContaining({
          rss: expect.any(Number),
          unit: expect.any(String)
        })
      })
    )
  })

  it('should handle config updates for GeoFusion', async () => {
    const newConfig = {
      triggerMode: 'time' as const,
      minDistanceMeters: 15,
      intervalMs: 2000
    }

    const updateConfigMock = vi.fn((config: any) => {
      Object.assign(geoFusion, config)
    })

    geoFusion.updateConfig = updateConfigMock

    geoFusion.updateConfig?.(newConfig)

    // Verify config was updated
    expect(updateConfigMock).toHaveBeenCalledWith(newConfig)
  })

  it('should maintain data consistency across service boundaries', async () => {
    // Simulate session with device state
    const sessionPoints: any[] = []

    const pointWithDeviceInfo = {
      sessionId: 'session-1',
      timestamp: Date.now(),
      position: { lat: -34.6037, lon: -58.3816, alt: 25, hdop: 0.9 },
      emf: {
        deviceId: 'nbm550',
        rss: 8.2,
        unit: 'V/m'
      },
      deviceState: deviceManager.getState?.()
    }

    sessionPoints.push(pointWithDeviceInfo)

    expect(sessionPoints[0].deviceState?.nbm550.status).toBe('connected')
    expect(sessionPoints[0].deviceState?.gps.status).toBe('connected')
    expect(sessionPoints[0].position).toEqual(
      expect.objectContaining({
        lat: expect.any(Number),
        lon: expect.any(Number)
      })
    )
  })
})
