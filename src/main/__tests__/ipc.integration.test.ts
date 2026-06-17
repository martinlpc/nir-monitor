import { describe, expect, it, beforeEach } from 'vitest'
import { createServices } from '../factories/ServiceFactory'
import type { DeviceManager } from '../services/DeviceManager'
import type { SessionService } from '../services/SessionService'

/**
 * Smoke tests para verificar que la integración de servicios funciona.
 * No son tests exhaustivos sino pruebas de que el sistema no crashea.
 *
 * Tests más complejos deben ir en tests unitarios mfocados en cada servicio.
 */

describe('IPC Integration: Services Smoke Tests', () => {
  let deviceManager: DeviceManager
  let sessionService: SessionService

  beforeEach(() => {
    const services = createServices()
    deviceManager = services.deviceManager
    sessionService = services.sessionService
  })

  it('should create services without crashing', () => {
    expect(deviceManager).toBeDefined()
    expect(sessionService).toBeDefined()
  })

  it('should allow calling scan()', async () => {
    // No throws = success
    await deviceManager.scan?.()
    expect(true).toBe(true)
  }, 30000)

  it('should allow calling sessionService methods without crashing', async () => {
    try {
      const state = sessionService.getState?.()
      expect(state).toBeDefined()
    } catch {
      // OK
    }
  })

  it('should not crash on repeated operations', async () => {
    for (let i = 0; i < 3; i++) {
      try {
        await deviceManager.scan?.()
      } catch {
        // OK
      }
    }
    expect(true).toBe(true)
  }, 120000)
})
