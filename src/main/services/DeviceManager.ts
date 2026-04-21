import { EventEmitter } from 'events'
import { NBM550Driver } from '../devices/nbm550/NBM550Driver'
import { GPSDriver } from '../devices/gps/GPSDriver'
import { loadPortConfig, savePortConfig, type PortConfigData } from './PortConfig'
import type { DeviceStatus } from '../../shared/device.types'
import type { GeoPosition } from '../../shared/GeoTimestamp'
import type { ISerialPortScanner } from '../../shared/services/ISerialPortScanner'

export interface DeviceManagerState {
  nbm550: { port: string | null; status: DeviceStatus }
  gps: { port: string | null; status: DeviceStatus }
  scanning: boolean
}

const GPS_BAUD_RATE = 4800
const NBM_RECONNECT_INTERVAL_MS = 3000
const NBM_RECONNECT_TIMEOUT_MS = 30000
const GPS_RECONNECT_INTERVAL_MS = 3000
const GPS_RECONNECT_TIMEOUT_MS = 30000
const NBM_MAX_CONSECUTIVE_READ_FAILURES = 8

export class DeviceManager extends EventEmitter {
  private nbm: NBM550Driver | null = null
  private gps: GPSDriver | null = null
  private portConfig: PortConfigData = {}
  private scanning: boolean = false
  private nbmPollInterval: NodeJS.Timeout | null = null
  private nbmSampleCount: number = 0
  private nbmConsecutiveReadFailures: number = 0
  private scanner: ISerialPortScanner
  private nbmIntentionalDisconnect: boolean = false
  private nbmReconnecting: boolean = false
  private nbmReconnectInterval: NodeJS.Timeout | null = null
  private nbmReconnectDeadline: NodeJS.Timeout | null = null
  private gpsIntentionalDisconnect: boolean = false
  private gpsReconnecting: boolean = false
  private gpsReconnectInterval: NodeJS.Timeout | null = null
  private gpsReconnectDeadline: NodeJS.Timeout | null = null

  constructor(scanner: ISerialPortScanner) {
    super()
    this.scanner = scanner
  }

  // -- Init ------------------------------------------

  async initialize(): Promise<void> {
    this.portConfig = loadPortConfig()
    await this.scan()
  }

  // ── Accesors de SessionService --------------------------

  getNBM(): NBM550Driver | null {
    return this.nbm
  }

  getGPS(): GPSDriver | null {
    return this.gps
  }

  getState(): DeviceManagerState {
    return {
      nbm550: {
        port: this.nbm?.meta.port ?? null,
        status: this.nbm?.status ?? 'disconnected'
      },
      gps: {
        port: this.gps?.meta.port ?? null,
        status: this.gps?.status ?? 'disconnected'
      },
      scanning: this.scanning
    }
  }

  // -- Scan --------------------------------------------------

  async scan(): Promise<DeviceManagerState> {
    if (this.scanning) return this.getState()
    this.scanning = true
    this.emit('scanning', true)

    try {
      await this.disconnectAll()

      // Delegar scanning al scanner inyectado, pasando puertos preferidos de la última sesión
      const { nbmPort, gpsPort } = await this.scanner.scanAndProbeAll({
        gps: this.portConfig.gps,
        nbm550: this.portConfig.nbm550
      })

      console.log(`[DeviceManager] Scan complete. NBM: ${nbmPort}, GPS: ${gpsPort}`)

      // Inicializar drivers
      if (nbmPort) await this.initNBM(nbmPort)
      if (gpsPort) await this.initGPS(gpsPort)

      // Persistir info encontrada
      this.portConfig = {
        nbm550: nbmPort ?? undefined,
        gps: gpsPort ?? undefined
      }
      savePortConfig(this.portConfig)
    } finally {
      this.scanning = false
      this.emit('scanning', false)
      this.emit('state', this.getState())
    }

    return this.getState()
  }

  // -- Config manual ----------------------------------------------

  async setPortManual(device: 'nbm550' | 'gps', port: string): Promise<void> {
    if (device === 'nbm550') {
      this.nbmIntentionalDisconnect = true
      this.nbmReconnecting = false
      this.stopNBMReconnect()
      this.stopNBMPolling()
      if (this.nbm) await this.nbm.disconnect()
      await this.initNBM(port)
      this.portConfig.nbm550 = port
    } else {
      this.gpsIntentionalDisconnect = true
      this.gpsReconnecting = false
      this.stopGPSReconnect()
      if (this.gps) await this.gps.disconnect()
      await this.initGPS(port)
      this.portConfig.gps = port
    }

    savePortConfig(this.portConfig)
    this.emit('state', this.getState())
  }

  async disconnectDevice(device: 'nbm550' | 'gps'): Promise<void> {
    if (device === 'nbm550') {
      this.nbmIntentionalDisconnect = true
      this.nbmReconnecting = false
      this.stopNBMReconnect()
      this.stopNBMPolling()
      if (this.nbm) {
        this.nbm.removeAllListeners()
        await this.nbm.disconnect().catch(() => {})
      }
      this.nbm = null
    } else {
      this.gpsIntentionalDisconnect = true
      this.gpsReconnecting = false
      this.stopGPSReconnect()
      if (this.gps) {
        this.gps.removeAllListeners()
        await this.gps.disconnect().catch(() => {})
      }
      this.gps = null
    }
    this.emit('state', this.getState())
  }

  async disconnectAll(): Promise<void> {
    this.nbmIntentionalDisconnect = true
    this.gpsIntentionalDisconnect = true
    this.nbmReconnecting = false
    this.gpsReconnecting = false
    this.stopNBMReconnect()
    this.stopGPSReconnect()
    this.stopNBMPolling()
    if (this.nbm) {
      this.nbm.removeAllListeners()
      await this.nbm.disconnect().catch(() => {})
    }
    if (this.gps) {
      this.gps.removeAllListeners()
      await this.gps.disconnect().catch(() => {})
    }
    this.nbm = null
    this.gps = null
  }

  private stopNBMReconnect(): void {
    if (this.nbmReconnectInterval) {
      clearTimeout(this.nbmReconnectInterval)
      this.nbmReconnectInterval = null
    }
    if (this.nbmReconnectDeadline) {
      clearTimeout(this.nbmReconnectDeadline)
      this.nbmReconnectDeadline = null
    }
  }

  private startNBMReconnect(port: string): void {
    if (this.nbmReconnecting) return // Ya hay un ciclo de reconexión activo
    this.nbmReconnecting = true
    this.stopNBMReconnect()
    console.log(
      `[DeviceManager] NBM unexpected disconnect — retrying for ${NBM_RECONNECT_TIMEOUT_MS / 1000}s...`
    )
    this.emit('device:status', { deviceId: 'nbm550', status: 'connecting' })

    const attemptReconnect = async (): Promise<void> => {
      if (!this.nbmReconnecting) return

      console.log(`[DeviceManager] NBM reconnect attempt on ${port}...`)
      try {
        this.stopNBMPolling()
        if (this.nbm) {
          this.nbm.removeAllListeners()
          await this.nbm.disconnect().catch(() => {})
          this.nbm = null
        }
        // Esperar a que el SO libere el puerto
        await new Promise((r) => setTimeout(r, 800))
        await this.initNBM(port)
        if (this.nbm?.isConnected()) {
          console.log(`[DeviceManager] NBM reconnected successfully`)
          this.nbmReconnecting = false
          this.stopNBMReconnect()
          return
        }
      } catch {
        // silenciar — se reintenta en el próximo ciclo
      }

      // Siguiente intento DESPUÉS de que este termine (serializado)
      if (this.nbmReconnecting) {
        this.nbmReconnectInterval = setTimeout(attemptReconnect, NBM_RECONNECT_INTERVAL_MS)
      }
    }

    // Primer intento tras el delay
    this.nbmReconnectInterval = setTimeout(attemptReconnect, NBM_RECONNECT_INTERVAL_MS)

    this.nbmReconnectDeadline = setTimeout(() => {
      console.log(`[DeviceManager] NBM reconnect timeout — giving up`)
      this.nbmReconnecting = false
      this.stopNBMReconnect() // Liberar el puerto si qued\u00f3 abierto del \u00faltimo intento
      if (this.nbm) {
        this.nbm.removeAllListeners()
        this.nbm.disconnect().catch(() => {})
        this.nbm = null
      }
      this.emit('device:status', { deviceId: 'nbm550', status: 'disconnected' })
    }, NBM_RECONNECT_TIMEOUT_MS)
  }

  private stopGPSReconnect(): void {
    if (this.gpsReconnectInterval) {
      clearTimeout(this.gpsReconnectInterval)
      this.gpsReconnectInterval = null
    }
    if (this.gpsReconnectDeadline) {
      clearTimeout(this.gpsReconnectDeadline)
      this.gpsReconnectDeadline = null
    }
  }

  private startGPSReconnect(port: string): void {
    if (this.gpsReconnecting) return // Ya hay un ciclo de reconexión activo
    this.gpsReconnecting = true
    this.stopGPSReconnect()
    console.log(
      `[DeviceManager] GPS unexpected disconnect — retrying for ${GPS_RECONNECT_TIMEOUT_MS / 1000}s...`
    )
    this.emit('device:status', { deviceId: 'gps', status: 'connecting' })

    const attemptReconnect = async (): Promise<void> => {
      if (!this.gpsReconnecting) return

      console.log(`[DeviceManager] GPS reconnect attempt on ${port}...`)
      try {
        if (this.gps) {
          this.gps.removeAllListeners()
          await this.gps.disconnect().catch(() => {})
          this.gps = null
        }
        // Esperar a que el SO libere el puerto
        await new Promise((r) => setTimeout(r, 800))
        await this.initGPS(port)
        if (this.gps?.isConnected()) {
          console.log(`[DeviceManager] GPS reconnected successfully`)
          this.gpsReconnecting = false
          this.stopGPSReconnect()
          return
        }
      } catch {
        // silenciar — se reintenta en el próximo ciclo
      }

      // Siguiente intento DESPUÉS de que este termine (serializado)
      if (this.gpsReconnecting) {
        this.gpsReconnectInterval = setTimeout(attemptReconnect, GPS_RECONNECT_INTERVAL_MS)
      }
    }

    // Primer intento tras el delay
    this.gpsReconnectInterval = setTimeout(attemptReconnect, GPS_RECONNECT_INTERVAL_MS)

    this.gpsReconnectDeadline = setTimeout(() => {
      console.log(`[DeviceManager] GPS reconnect timeout — giving up`)
      this.gpsReconnecting = false
      this.stopGPSReconnect() // Liberar el puerto si qued\u00f3 abierto del \u00faltimo intento
      if (this.gps) {
        this.gps.removeAllListeners()
        this.gps.disconnect().catch(() => {})
        this.gps = null
      }
      this.emit('device:status', { deviceId: 'gps', status: 'disconnected' })
    }, GPS_RECONNECT_TIMEOUT_MS)
  }

  async connectDevice(device: 'nbm550' | 'gps'): Promise<void> {
    const port =
      device === 'nbm550'
        ? (this.nbm?.meta.port ?? this.portConfig.nbm550 ?? null)
        : (this.gps?.meta.port ?? this.portConfig.gps ?? null)

    if (!port) {
      console.warn(`[DeviceManager] connectDevice: no port configured for ${device}`)
      return
    }

    await this.setPortManual(device, port)
  }

  // -- Init drivers ---------------------------------------------

  private async initNBM(port: string): Promise<void> {
    console.log(`[DeviceManager] initNBM starting on port ${port}`)
    this.nbmIntentionalDisconnect = false
    this.nbm = new NBM550Driver({ port, baudRate: 460800, pollIntervalMs: 200, unit: 'V/m' })

    this.nbm.on('status', (status: DeviceStatus) => {
      console.log(`[DeviceManager] NBM status changed to: ${status}`)
      this.emit('device:status', { deviceId: 'nbm550', status })

      if (status === 'connected') {
        console.log(`[DeviceManager] Starting NBM polling`)
        this.stopNBMReconnect() // cancelar si había un reintento en curso
        this.startNBMPolling()
      } else if (
        (status === 'disconnected' || status === 'error') &&
        !this.nbmIntentionalDisconnect
      ) {
        this.stopNBMPolling()
        this.startNBMReconnect(port)
      } else {
        this.stopNBMPolling()
      }
    })

    this.nbm.on('error', (err: Error) => {
      console.log(`[DeviceManager] NBM error: ${err.message}`)
      this.emit('device:error', { deviceId: 'nbm550', error: err.message })
    })

    console.log(`[DeviceManager] Calling nbm.connect()`)
    try {
      await this.nbm.connect()
      console.log(`[DeviceManager] NBM connected successfully`)
    } catch (err) {
      console.error(`[DeviceManager] NBM connect failed:`, err)
    }
  }

  private startNBMPolling(): void {
    if (this.nbmPollInterval) return

    this.nbmSampleCount = 0
    this.nbmConsecutiveReadFailures = 0

    this.nbmPollInterval = setInterval(async () => {
      if (!this.nbm?.isConnected()) {
        this.stopNBMPolling()
        return
      }

      try {
        // Leer batería cada 5 muestras (cada ~1 segundo con 200ms intervalo)
        if (this.nbmSampleCount % 5 === 0) {
          const battery = await this.nbm.readBattery()
          if (battery === null) {
            this.nbmConsecutiveReadFailures++
          }
        }

        const sample = await this.nbm.readMeasurement()
        if (sample) {
          this.nbmConsecutiveReadFailures = 0
          this.emit('nbm:sample', {
            rss: sample.rss,
            unit: sample.unit,
            battery: sample.battery,
            timestamp: sample.timestamp
          })
        } else {
          this.nbmConsecutiveReadFailures++
        }

        if (this.nbmConsecutiveReadFailures >= NBM_MAX_CONSECUTIVE_READ_FAILURES) {
          const port = this.nbm?.meta.port ?? this.portConfig.nbm550 ?? 'desconocido'
          const message = `NBM-550 sin respuesta continua en ${port}; iniciando reconexión automática`
          console.error(`[DeviceManager] ${message}`)
          this.emit('device:error', { deviceId: 'nbm550', error: message })
          this.stopNBMPolling()
          this.startNBMReconnect(port)
          return
        }

        this.nbmSampleCount++
      } catch {
        // Silenciar errores de lectura - el dispositivo puede estar ocupado
      }
    }, 200) // 5 Hz matching NBM config
  }

  private stopNBMPolling(): void {
    if (this.nbmPollInterval) {
      clearInterval(this.nbmPollInterval)
      this.nbmPollInterval = null
      this.nbmSampleCount = 0
      this.nbmConsecutiveReadFailures = 0
    }
  }

  private async initGPS(port: string): Promise<void> {
    console.log(`[DeviceManager] initGPS starting on port ${port}`)
    this.gpsIntentionalDisconnect = false
    this.gps = new GPSDriver({ port, baudRate: GPS_BAUD_RATE })

    this.gps.on('status', (status: DeviceStatus) => {
      console.log(`[DeviceManager] GPS status changed to: ${status}`)
      this.emit('device:status', { deviceId: 'gps', status })

      if (status === 'connected') {
        this.stopGPSReconnect()
      } else if (
        (status === 'disconnected' || status === 'error') &&
        !this.gpsIntentionalDisconnect
      ) {
        this.startGPSReconnect(port)
      }
    })

    this.gps.on('error', (err: Error) => {
      console.error('[GPS] Connection error:', err.message)
      this.emit('device:error', { deviceId: 'gps', error: err.message })
    })

    this.gps.on('nmea', (line: string) => {
      this.emit('gps:nmea', { line, port })
    })

    this.gps.on('position', (coords: GeoPosition | null, valid: boolean) => {
      this.emit('gps:position', { coords, valid, port })
    })

    this.gps.on('fix-lost', () => {
      console.log(`[DeviceManager] GPS fix lost`)
      this.emit('gps:fix-lost')
    })

    console.log(`[DeviceManager] Calling gps.connect()`)
    const maxRetries = 3
    const retryDelayMs = 600
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.gps.connect()
        console.log(`[DeviceManager] GPS connected successfully`)
        return
      } catch (err) {
        console.error(`[DeviceManager] GPS connect failed (attempt ${attempt}/${maxRetries}):`, err)
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, retryDelayMs))
        }
      }
    }
  }
}
