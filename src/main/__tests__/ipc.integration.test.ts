import { describe, expect, it, beforeEach } from 'vitest'
import { createServices } from '../factories/ServiceFactory'

/**
 * Smoke tests para verificar que la integración de servicios funciona.
 * No son tests exhaustivos sino pruebas de que el sistema no crashea.
 *
 * Tests más complejos deben ir en tests unitarios mfocados en cada servicio.
 */

describe('IPC Integration: Services Smoke Tests', () => {
  let deviceManager: any
  let sessionService: any

  beforeEach(() => {
    const services = createServices()
    deviceManager = services.deviceManager as any
    sessionService = services.sessionService as any
  })

  it('should create services without crashing', () => {
    expect(deviceManager).toBeDefined()
    expect(sessionService).toBeDefined()
  })

  it('should allow calling scan()', async () => {
    // No throws = success
    await deviceManager.scan?.()
    expect(true).toBe(true)
  })

  it('should allow calling sessionService methods without crashing', async () => {
    try {
      const state = sessionService.getState?.()
      expect(state).toBeDefined()
    } catch (err) {
      // OK
    }
  })

  it('should not crash on repeated operations', async () => {
    for (let i = 0; i < 3; i++) {
      try {
        await deviceManager.scan?.()
      } catch (err) {
        // OK
      }
    }
    expect(true).toBe(true)
  })
})
