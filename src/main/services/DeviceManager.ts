import { EventEmitter } from 'events'
import { NBM550Driver } from '../devices/nbm550/NBM550Driver'
import { GPSDriver } from '../devices/gps/GPSDriver'
import { SimulatedNBM550Driver } from '../devices/simulated/SimulatedNBM550Driver'
import { SimulatedGPSDriver } from '../devices/simulated/SimulatedGPSDriver'
import { loadPortConfig, savePortConfig, type PortConfigData } from './PortConfig'
import { ReconnectController } from './ReconnectController'
import { NBMPollingController, NBM_POLL_INTERVAL_MS } from './NBMPollingController'
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
  private nbm: NBM550Driver | SimulatedNBM550Driver | null = null
  private gps: GPSDriver | SimulatedGPSDriver | null = null
  private portConfig: PortConfigData = {}
  private scanning: boolean = false
  private scanner: ISerialPortScanner
  private nbmIntentionalDisconnect: boolean = false
  private nbmReconnect: ReconnectController
  private gpsReconnect: ReconnectController
  private nbmPolling: NBMPollingController
  private gpsIntentionalDisconnect: boolean = false
  private simulationMode: boolean

  constructor(scanner: ISerialPortScanner, simulationMode: boolean = false) {
    super()

    this.simulationMode = simulationMode
    this.scanner = scanner

    const pollInterval = this.simulationMode ? 5000 : NBM_POLL_INTERVAL_MS

    this.nbmReconnect = new ReconnectController({
      deviceId: 'nbm550',
      intervalMs: NBM_RECONNECT_INTERVAL_MS,
      timeoutMs: NBM_RECONNECT_TIMEOUT_MS,
      connectFn: async (port) => {
        this.nbmPolling.stop()
        if (this.nbm) {
          await this.nbm.disconnect().catch(() => {})
          this.nbm.removeAllListeners()
          this.nbm = null
        }
        await new Promise((r) => setTimeout(r, 800))
        const nbmDriver = await this.initNBM(port)
        return nbmDriver?.isConnected() ?? false
      },
      onStatus: (deviceId, status) => this.emit('device:status', { deviceId, status })
    })

    this.gpsReconnect = new ReconnectController({
      deviceId: 'gps',
      intervalMs: GPS_RECONNECT_INTERVAL_MS,
      timeoutMs: GPS_RECONNECT_TIMEOUT_MS,
      connectFn: async (port) => {
        if (this.gps) {
          await this.gps.disconnect().catch(() => {})
          this.gps.removeAllListeners()
          this.gps = null
        }
        await new Promise((r) => setTimeout(r, 800))
        const gpsDriver = await this.initGPS(port)
        return gpsDriver?.isConnected() ?? false
      },
      onStatus: (deviceId, status) => this.emit('device:status', { deviceId, status })
    })

    this.nbmPolling = new NBMPollingController(
      NBM_MAX_CONSECUTIVE_READ_FAILURES,
      {
        onSample: (sample) => this.emit('nbm:sample', sample),
        onMaxFailuresExceeded: (port, message) => {
          this.emit('device:error', { deviceId: 'nbm550', error: message })
          this.nbmReconnect.start(port)
        }
      },
      pollInterval
    )
  }

  // -- Init ------------------------------------------

  async initialize(): Promise<void> {
    this.portConfig = loadPortConfig()
    await this.scan()
  }

  // ── Accesors de SessionService --------------------------

  getNBM(): NBM550Driver | SimulatedNBM550Driver | null {
    return this.nbm
  }

  getGPS(): GPSDriver | SimulatedGPSDriver | null {
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

      const { nbmPort, gpsPort } = await this.scanner.scanAndProbeAll({
        gps: this.portConfig.gps,
        nbm550: this.portConfig.nbm550
      })

      console.log(`[DeviceManager] Scan complete. NBM: ${nbmPort}, GPS: ${gpsPort}`)

      if (nbmPort) await this.initNBM(nbmPort)
      if (gpsPort) await this.initGPS(gpsPort)

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
      this.nbmReconnect.stop()
      this.nbmPolling.stop()
      if (this.nbm) await this.nbm.disconnect()
      await this.initNBM(port)
      this.portConfig.nbm550 = port
    } else {
      this.gpsIntentionalDisconnect = true
      this.gpsReconnect.stop()
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
      this.nbmReconnect.stop()
      this.nbmPolling.stop()
      if (this.nbm) {
        await this.nbm.disconnect().catch(() => {})
        this.nbm.removeAllListeners()
      }
      this.nbm = null
    } else {
      this.gpsIntentionalDisconnect = true
      this.gpsReconnect.stop()
      if (this.gps) {
        await this.gps.disconnect().catch(() => {})
        this.gps.removeAllListeners()
      }
      this.gps = null
    }
    this.emit('state', this.getState())
  }

  async disconnectAll(): Promise<void> {
    this.nbmIntentionalDisconnect = true
    this.gpsIntentionalDisconnect = true
    this.nbmReconnect.stop()
    this.gpsReconnect.stop()
    this.nbmPolling.stop()
    if (this.nbm) {
      await this.nbm.disconnect().catch(() => {})
      this.nbm.removeAllListeners()
    }
    if (this.gps) {
      await this.gps.disconnect().catch(() => {})
      this.gps.removeAllListeners()
    }
    this.nbm = null
    this.gps = null
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

  private async initNBM(port: string): Promise<NBM550Driver | SimulatedNBM550Driver> {
    console.log(
      `[DeviceManager] initNBM starting on port ${port}${this.simulationMode ? ' (simulado)' : ''}`
    )
    this.nbmIntentionalDisconnect = false
    this.nbm = this.simulationMode
      ? new SimulatedNBM550Driver({ port })
      : new NBM550Driver({ port, baudRate: 460800, pollIntervalMs: 200, unit: 'V/m' })

    this.nbm.on('status', (status: DeviceStatus) => {
      console.log(`[DeviceManager] NBM status changed to: ${status}`)
      this.emit('device:status', { deviceId: 'nbm550', status })

      if (status === 'connected') {
        console.log(`[DeviceManager] Starting NBM polling`)
        this.nbmReconnect.stop()
        this.nbmPolling.start(this.nbm!)
      } else if (
        (status === 'disconnected' || status === 'error') &&
        !this.nbmIntentionalDisconnect
      ) {
        this.nbmPolling.stop()
        this.nbmReconnect.start(port)
      } else {
        this.nbmPolling.stop()
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

    return this.nbm!
  }

  private async initGPS(port: string): Promise<GPSDriver | SimulatedGPSDriver> {
    console.log(
      `[DeviceManager] initGPS starting on port ${port}${this.simulationMode ? ' (simulado)' : ''}`
    )
    this.gpsIntentionalDisconnect = false
    this.gps = this.simulationMode
      ? new SimulatedGPSDriver({ port })
      : new GPSDriver({ port, baudRate: GPS_BAUD_RATE })

    this.gps.on('status', (status: DeviceStatus) => {
      console.log(`[DeviceManager] GPS status changed to: ${status}`)
      this.emit('device:status', { deviceId: 'gps', status })

      if (status === 'connected') {
        this.gpsReconnect.stop()
      } else if (
        (status === 'disconnected' || status === 'error') &&
        !this.gpsIntentionalDisconnect
      ) {
        this.gpsReconnect.start(port)
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
        return this.gps
      } catch (err) {
        console.error(`[DeviceManager] GPS connect failed (attempt ${attempt}/${maxRetries}):`, err)
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, retryDelayMs))
        }
      }
    }

    return this.gps!
  }
}
