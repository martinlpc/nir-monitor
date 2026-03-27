import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'
import { EventEmitter } from 'events'
import { parseNmeaSentence } from 'nmea-simple'
import type { GGAPacket } from 'nmea-simple'
import type { RMCPacket } from 'nmea-simple'
import type { GSAPacket } from 'nmea-simple'
import type { GeoPosition } from '../../../shared/GeoTimestamp'
import type { IDeviceDriver, DeviceStatus, DeviceMeta } from '../../../shared/device.types'
import { INITIAL_GPS_STATE, type GPSState } from './gps.types'

export interface GPSConfig {
  port: string
  baudRate: number // típico: 4800 o 9600
}

export const GPS_DEFAULTS: GPSConfig = {
  port: 'COM3',
  baudRate: 4800
}

export class GPSDriver extends EventEmitter implements IDeviceDriver {
  readonly meta: DeviceMeta
  status: DeviceStatus = 'disconnected'

  private port: SerialPort | null = null
  private lineParser: ReadlineParser | null = null
  private state: GPSState = { ...INITIAL_GPS_STATE }
  private config: GPSConfig
  private fixLossTimeoutRef: NodeJS.Timeout | null = null

  constructor(config: GPSConfig) {
    super()
    this.config = config

    this.meta = {
      id: 'gps-primary',
      name: 'GPS NMEA',
      type: 'gps',
      port: config.port,
      baudRate: config.baudRate
    }
  }

  // ── IDeviceDriver ─────────────────────────────────────────

  async connect(): Promise<void> {
    this.setStatus('connecting')

    this.port = new SerialPort({
      path: this.config.port,
      baudRate: this.config.baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false
    })

    // ReadlineParser divide el stream en líneas — perfecto para NMEA
    this.lineParser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }))

    await this.openPort()
    this.attachParser()
    this.setStatus('connected')
  }

  async disconnect(): Promise<void> {
    this.state = { ...INITIAL_GPS_STATE }

    if (this.fixLossTimeoutRef) {
      clearTimeout(this.fixLossTimeoutRef)
      this.fixLossTimeoutRef = null
    }

    if (this.port?.isOpen) {
      await this.closePort()
    }

    this.setStatus('disconnected')
  }

  isConnected(): boolean {
    return this.status === 'connected' && (this.port?.isOpen ?? false)
  }

  // ── API pública para GeoFusionService ─────────────────────

  getLastPosition(): GeoPosition | null {
    return this.state.position
  }

  isPositionValid(): boolean {
    return this.state.valid
  }

  getState(): GPSState {
    return { ...this.state }
  }

  // ── Parser NMEA ───────────────────────────────────────────

  private attachParser(): void {
    this.lineParser!.on('data', (line: string) => {
      this.handleNMEALine(line.trim())
    })

    this.port!.on('error', (err: Error) => {
      this.setStatus('error')
      this.emit('error', err)
    })

    this.port!.on('close', () => {
      this.state = { ...INITIAL_GPS_STATE }
      this.setStatus('disconnected')
    })
  }

  private handleNMEALine(line: string): void {
    if (!line.startsWith('$')) return

    this.emit('nmea', line)

    try {
      const sentence = parseNmeaSentence(line)

      switch (sentence.sentenceId) {
        case 'GGA': {
          const gga = sentence as GGAPacket
          const valid = gga.fixType !== 'none'

          if (valid) {
            // Limpiar timeout anterior si existe
            if (this.fixLossTimeoutRef) {
              clearTimeout(this.fixLossTimeoutRef)
            }

            this.state.position = {
              lat: gga.latitude,
              lon: gga.longitude,
              alt: gga.altitudeMeters,
              hdop: gga.horizontalDilution
            }
            this.state.satelliteCount = gga.satellitesInView

            // Reiniciar timeout - si pasan 5s sin nueva posición válida, marcar como sin fix
            this.fixLossTimeoutRef = setTimeout(() => {
              this.state.valid = false
              this.state.position = null
              this.emit('fix-lost')
              this.fixLossTimeoutRef = null
            }, 5000)
          }

          this.state.valid = valid
          this.state.lastUpdateAt = Date.now()

          // Emite siempre — válido o no — para que el mapa pueda reaccionar
          this.emit('position', this.state.position, valid)
          break
        }

        case 'RMC': {
          // Velocidad y heading — complementa GGA
          const rmc = sentence as RMCPacket
          if (rmc.status === 'valid') {
            this.state.speed = rmc.speedKnots * 1.852 // nudos → km/h
            this.state.heading = rmc.trackTrue
          }
          break
        }

        case 'GSA': {
          // Fix type 2D/3D
          const gsa = sentence as GSAPacket
          const mode = gsa.fixMode
          if (mode === '3D') this.state.fixType = '3d'
          else if (mode === '2D') this.state.fixType = '2d'
          else this.state.fixType = 'none'
          break
        }

        // Otras tramas (GSV, VTG, etc.) se ignoran
        default:
          break
      }
    } catch {
      // Trama malformada o checksum inválido — ignorar silenciosamente
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  private openPort(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port!.open((err) => (err ? reject(err) : resolve()))
    })
  }

  private closePort(): Promise<void> {
    return new Promise((resolve) => {
      this.port!.close(() => resolve())
    })
  }

  private setStatus(status: DeviceStatus): void {
    this.status = status
    this.emit('status', status)
  }
}
