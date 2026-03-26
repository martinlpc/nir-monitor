import { SerialPort } from 'serialport'
import { EventEmitter } from 'events'
import { NBM550Driver } from '../devices/nbm550/NBM550Driver'
import { GPSDriver } from '../devices/gps/GPSDriver'
import { loadPortConfig, savePortConfig, type PortConfigData } from './PortConfig'
import type { DeviceStatus } from '../../shared/device.types'
import type { GeoPosition } from '../../shared/GeoTimestamp'

const NBM_BAUD_RATE = 460800
const GPS_BAUD_RATE = 4800
const PROBE_TIMEOUT_MS = 3000 // tiempo maximo para identificar un puerto
const NMEA_LISTEN_MS = 2500 // tiempo de escucha para detectar GPS

export interface DeviceManagerState {
  nbm550: { port: string | null; status: DeviceStatus }
  gps: { port: string | null; status: DeviceStatus }
  scanning: boolean
}

export class DeviceManager extends EventEmitter {
  private nbm: NBM550Driver | null = null
  private gps: GPSDriver | null = null
  private portConfig: PortConfigData = {}
  private scanning: boolean = false

  // -- Init ------------------------------------------

  async initialize(): Promise<void> {
    this.portConfig = loadPortConfig()
    await this.scan()
  }

  // -- Accesors de SessionService --------------------------

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

      const ports = await SerialPort.list()
      const portPaths = ports.map((p) => p.path)

      // Busca si hay info persistida en config para intentar primero
      const nbmPort = this.portConfig.nbm550
      const gpsPort = this.portConfig.gps

      let nbmFound: string | null = null
      let gpsFound: string | null = null

      // Intentar puertos persistidos primero
      if (nbmPort && portPaths.includes(nbmPort)) {
        const ok = await this.probeNBM(nbmPort)
        if (ok) nbmFound = nbmPort
      }

      if (gpsPort && portPaths.includes(gpsPort)) {
        const ok = await this.probeGPS(gpsPort)
        if (ok) gpsFound = gpsPort
      }

      // Escanear resto de puertos
      const remaining = portPaths.filter((p) => p !== nbmPort && p !== gpsPort)

      for (const path of remaining) {
        if (nbmFound && gpsFound) break

        if (!nbmFound) {
          const ok = await this.probeNBM(path)
          if (ok) {
            nbmFound = path
            continue
          }
        }

        if (!gpsFound) {
          const ok = await this.probeGPS(path)
          if (ok) gpsFound = path
        }
      }

      // Inicializar drivers
      if (nbmFound) await this.initNBM(nbmFound)
      if (gpsFound) await this.initGPS(gpsFound)

      // Persistir info encontrada en la config de puertos
      this.portConfig = {
        nbm550: nbmFound ?? undefined,
        gps: gpsFound ?? undefined
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
    if (this.nbm?.isConnected()) await this.nbm.disconnect().catch(() => {})
    if (this.gps?.isConnected()) await this.gps.disconnect().catch(() => {})
    this.nbm = null
    this.gps = null
  }

  // -- Probe: identificar dispositivos --------------------------

  private async probeNBM(path: string): Promise<boolean> {
    return new Promise((resolve) => {
      let port: SerialPort | null = null
      let buffer = ''
      let done = false

      const finish = (result: boolean): void => {
        if (done) return
        done = true
        clearTimeout(timer)
        port?.close(() => resolve(result))
      }

      const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS)

      try {
        port = new SerialPort({
          path,
          baudRate: NBM_BAUD_RATE,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          autoOpen: false
        })

        port.open((err) => {
          if (err) return finish(false)

          port!.on('data', (chunk: Buffer) => {
            buffer += chunk.toString('ascii')
            if (buffer.includes(';')) {
              finish(buffer.toUpperCase().includes('NBM'))
            }
          })

          port!.on('error', () => finish(false))

          setTimeout(() => {
            port?.write('REMOTE ON;\r\n', () => {
              setTimeout(() => {
                port?.write('DEVICE_INFO?;\r\n', () => {})
              }, 300)
            })
          }, 200)
        })
      } catch {
        finish(false)
      }
    })
  }

  private async probeGPS(path: string): Promise<boolean> {
    return new Promise((resolve) => {
      let port: SerialPort | null = null
      let done = false

      const finish = (result: boolean): void => {
        if (done) return
        done = true
        clearTimeout(timer)
        port?.close(() => resolve(result))
      }

      const timer = setTimeout(() => finish(false), NMEA_LISTEN_MS)

      try {
        port = new SerialPort({
          path,
          baudRate: GPS_BAUD_RATE,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          autoOpen: false
        })

        port.open((err) => {
          if (err) return finish(false)

          port!.on('data', (chunk: Buffer) => {
            const data = chunk.toString('ascii')
            // Tramas NMEA empiezan con $GP, $GN, $GL, $GA
            if (/\$G[PNLA]/.test(data)) {
              finish(true)
            }
          })

          port!.on('error', () => finish(false))
        })
      } catch {
        finish(false)
      }
    })
  }

  // -- Init drivers ---------------------------------------------

  private async initNBM(port: string): Promise<void> {
    this.nbm = new NBM550Driver({ port, baudRate: 460800, pollIntervalMs: 200, unit: 'V/m' })

    this.nbm.on('status', (status: DeviceStatus) => {
      this.emit('device:status', { deviceId: 'nbm550', status })
    })

    this.nbm.on('error', (err: Error) => {
      this.emit('device:error', { deviceId: 'nbm550', error: err.message })
    })

    await this.nbm.connect()
  }

  private async initGPS(port: string): Promise<void> {
    this.gps = new GPSDriver({ port, baudRate: GPS_BAUD_RATE })

    this.gps.on('status', (status: DeviceStatus) => {
      this.emit('device:status', { deviceId: 'gps', status })
    })

    this.gps.on('error', (err: Error) => {
      this.emit('device:error', { deviceId: 'gps', error: err.message })
    })

    this.gps.on('nmea', (line: string) => {
      this.emit('gps:nmea', { line, port })
    })

    this.gps.on('position', (coords: GeoPosition | null, valid: boolean) => {
      this.emit('gps:position', { coords, valid, port })
    })

    await this.gps.connect()
  }
}
