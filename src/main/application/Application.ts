// Application orchestrator - inicializa y wirifica todos los servicios
import type { Services } from '../factories/ServiceFactory'

/**
 * Orquestador de aplicación - hace el "wiring" de servicios inyectables
 * Responsable de:
 * - Inicialización ordenada
 * - Conexión de eventos entre servicios
 * - Limpieza al apagar
 */
export class Application {
  private services: Services

  constructor(services: Services) {
    this.services = services
  }

  /**
   * Inicializa la aplicación y wirifica eventos entre servicios
   */
  async initialize(): Promise<void> {
    console.log('[Application] Initializing services...')

    // Wire: SessionService escucha eventos de DeviceManager
    // Cuando DeviceManager cambia estado de dispositivos, SessionService puede usarlos
    this.services.deviceManager.on('device:status', (data) => {
      console.log('[Application] Device status changed:', data)
    })

    // Wire: DeviceManager.scan() detecta y conecta dispositivos
    // Luego SessionService puede acceder a ellos via getNBM()/getGPS()
    await this.services.deviceManager.initialize()

    console.log('[Application] Services initialized ✓')
  }

  /**
   * Retorna los servicios inicializados
   */
  getServices(): Services {
    return this.services
  }

  /**
   * Limpieza ordenada al cerrar app
   */
  async shutdown(): Promise<void> {
    console.log('[Application] Shutting down...')

    try {
      // 1. Detener sesión activa si existe
      if (this.services.sessionService.getState() === 'running') {
        await this.services.sessionService.stop()
      }

      // 2. Desconectar dispositivos
      await this.services.deviceManager.disconnectAll()

      console.log('[Application] Shutdown complete ✓')
    } catch (err) {
      console.error('[Application] Error during shutdown:', err)
    }
  }
}
