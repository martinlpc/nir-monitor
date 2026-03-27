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

export class DeviceManager extends EventEmitter {
  private nbm: NBM550Driver | null = null
  private gps: GPSDriver | null = null
  private portConfig: PortConfigData = {}
  private scanning: boolean = false
  private nbmPollInterval: NodeJS.Timeout | null = null
  private nbmSampleCount: number = 0
  private scanner: ISerialPortScanner

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

      // Delegar scanning al scanner inyectado
      const { nbmPort, gpsPort } = await this.scanner.scanAndProbeAll()

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
      this.stopNBMPolling()
      if (this.nbm) await this.nbm.disconnect()
      await this.initNBM(port)
      this.portConfig.nbm550 = port
    } else {
      if (this.gps) await this.gps.disconnect()
      await this.initGPS(port)
      this.portConfig.gps = port
    }

    savePortConfig(this.portConfig)
    this.emit('state', this.getState())
  }

  async disconnectAll(): Promise<void> {
    this.stopNBMPolling()
    if (this.nbm?.isConnected()) await this.nbm.disconnect().catch(() => {})
    if (this.gps?.isConnected()) await this.gps.disconnect().catch(() => {})
    this.nbm = null
    this.gps = null
  }

  // -- Init drivers ---------------------------------------------

  private async initNBM(port: string): Promise<void> {
    console.log(`[DeviceManager] initNBM starting on port ${port}`)
    this.nbm = new NBM550Driver({ port, baudRate: 460800, pollIntervalMs: 200, unit: 'V/m' })

    this.nbm.on('status', (status: DeviceStatus) => {
      console.log(`[DeviceManager] NBM status changed to: ${status}`)
      this.emit('device:status', { deviceId: 'nbm550', status })

      // Iniciar polling cuando se conecta
      if (status === 'connected') {
        console.log(`[DeviceManager] Starting NBM polling`)
        this.startNBMPolling()
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

    this.nbmPollInterval = setInterval(async () => {
      if (!this.nbm?.isConnected()) {
        this.stopNBMPolling()
        return
      }

      try {
        // Leer batería cada 5 muestras (cada ~1 segundo con 200ms intervalo)
        if (this.nbmSampleCount % 5 === 0) {
          await this.nbm.readBattery()
        }

        const sample = await this.nbm.readMeasurement()
        if (sample) {
          this.emit('nbm:sample', {
            rss: sample.rss,
            unit: sample.unit,
            battery: sample.battery,
            timestamp: sample.timestamp
          })
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
    }
  }

  private async initGPS(port: string): Promise<void> {
    console.log(`[DeviceManager] initGPS starting on port ${port}`)
    this.gps = new GPSDriver({ port, baudRate: GPS_BAUD_RATE })

    this.gps.on('status', (status: DeviceStatus) => {
      console.log(`[DeviceManager] GPS status changed to: ${status}`)
      this.emit('device:status', { deviceId: 'gps', status })
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
    try {
      await this.gps.connect()
      console.log(`[DeviceManager] GPS connected successfully`)
    } catch (err) {
      console.error(`[DeviceManager] GPS connect failed:`, err)
    }
  }
}
