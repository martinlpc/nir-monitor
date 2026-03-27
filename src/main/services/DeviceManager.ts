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
const NMEA_LISTEN_MS = 4000 // tiempo de escucha para detectar GPS - aumentado para dar más tiempo

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
  private nbmPollInterval: NodeJS.Timeout | null = null
  private nbmSampleCount: number = 0

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
      console.log(`[DeviceManager] Scan started. Available ports:`, portPaths)

      // Busca si hay info persistida en config para intentar primero
      const nbmPort = this.portConfig.nbm550
      const gpsPort = this.portConfig.gps

      let nbmFound: string | null = null
      let gpsFound: string | null = null

      // Intentar puertos persistidos primero
      if (nbmPort && portPaths.includes(nbmPort)) {
        console.log(`[DeviceManager] Probing saved NBM port: ${nbmPort}`)
        const ok = await this.probeNBM(nbmPort)
        if (ok) nbmFound = nbmPort
      }

      if (gpsPort && portPaths.includes(gpsPort)) {
        console.log(`[DeviceManager] Probing saved GPS port: ${gpsPort}`)
        const ok = await this.probeGPS(gpsPort)
        if (ok) gpsFound = gpsPort
      }

      // Escanear resto de puertos
      const remaining = portPaths.filter((p) => p !== nbmPort && p !== gpsPort)
      console.log(`[DeviceManager] Scanning ${remaining.length} remaining ports...`)

      for (const path of remaining) {
        if (nbmFound && gpsFound) break

        if (!nbmFound) {
          console.log(`[DeviceManager] Probing NBM on: ${path}`)
          const ok = await this.probeNBM(path)
          if (ok) {
            nbmFound = path
            continue
          }
        }

        if (!gpsFound) {
          console.log(`[DeviceManager] Probing GPS on: ${path}`)
          const ok = await this.probeGPS(path)
          if (ok) gpsFound = path
        }
      }

      console.log(`[DeviceManager] Scan complete. NBM: ${nbmFound}, GPS: ${gpsFound}`)

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

  // -- Probe: identificar dispositivos --------------------------

  private async probeNBM(path: string): Promise<boolean> {
    return new Promise((resolve) => {
      let port: SerialPort | null = null
      let buffer = ''
      let done = false
      let responsesReceived = 0

      const finish = (result: boolean, reason: string = ''): void => {
        if (done) return
        done = true
        clearTimeout(timer)

        console.log(`[DeviceManager] probeNBM(${path}) finishing (${reason})`)

        // Drain y cerrar el puerto de forma segura
        if (port) {
          try {
            port.removeAllListeners('data')
            port.removeAllListeners('error')
            port.removeAllListeners('close')
          } catch (err) {
            // ignorar
          }

          // Intentar cerrar
          if (port.isOpen) {
            try {
              port.close((err) => {
                if (err) console.log(`[DeviceManager] probeNBM(${path}) close error:`, err.message)
                console.log(
                  `[DeviceManager] probeNBM(${path}): ${result ? '✓ NBM detected' : '✗ No NBM'}`
                )
                resolve(result)
              })
              return
            } catch (err) {
              console.log(`[DeviceManager] probeNBM(${path}) close exception:`, err)
            }
          }
        }

        console.log(`[DeviceManager] probeNBM(${path}): ${result ? '✓ NBM detected' : '✗ No NBM'}`)
        resolve(result)
      }

      const timer = setTimeout(() => finish(false, 'timeout'), PROBE_TIMEOUT_MS)

      try {
        port = new SerialPort({
          path,
          baudRate: NBM_BAUD_RATE,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          autoOpen: false
        })

        // Error handler que ignora si ya terminamos
        port.on('error', (err) => {
          if (!done) {
            console.log(`[DeviceManager] probeNBM(${path}) port error:`, err.message)
            finish(false, 'port error')
          }
        })

        port.open((err) => {
          if (err) {
            if (!done) {
              console.log(`[DeviceManager] probeNBM(${path}) open error:`, err.message)
              finish(false, 'open error')
            }
            return
          }

          if (done) return

          console.log(`[DeviceManager] probeNBM(${path}) port opened`)

          port!.on('data', (chunk: Buffer) => {
            if (done) return

            buffer += chunk.toString('ascii')

            // NBM responde con terminador ";"
            while (buffer.includes(';')) {
              const endIdx = buffer.indexOf(';')
              const response = buffer.substring(0, endIdx + 1)
              buffer = buffer.substring(endIdx + 1)
              responsesReceived++

              console.log(
                `[DeviceManager] probeNBM(${path}) response ${responsesReceived}:`,
                response
              )

              // Segunda respuesta debería contener "NARDA" o "550"
              if (responsesReceived === 2) {
                if (
                  response.toUpperCase().includes('NARDA') ||
                  response.toUpperCase().includes('550') ||
                  response.toUpperCase().includes('NBM')
                ) {
                  finish(true, 'NBM detected')
                  return
                } else {
                  finish(false, 'invalid response')
                  return
                }
              }
            }
          })

          setTimeout(() => {
            if (done) return
            console.log(`[DeviceManager] probeNBM(${path}) sending REMOTE ON`)
            port?.write('REMOTE ON;\r\n', () => {
              setTimeout(() => {
                if (done) return
                console.log(`[DeviceManager] probeNBM(${path}) sending DEVICE_INFO?`)
                port?.write('DEVICE_INFO?;\r\n', () => {})
              }, 200)
            })
          }, 100)
        })
      } catch (err) {
        console.log(`[DeviceManager] probeNBM(${path}) exception:`, err)
        finish(false, 'exception')
      }
    })
  }

  private async probeGPS(path: string): Promise<boolean> {
    return new Promise((resolve) => {
      let port: SerialPort | null = null
      let done = false
      let buffer = ''

      const finish = (result: boolean, reason: string = ''): void => {
        if (done) return
        done = true
        clearTimeout(timer)

        console.log(`[DeviceManager] probeGPS(${path}) finishing (${reason})`)

        // Cerrar el puerto de forma segura
        if (port) {
          try {
            port.removeAllListeners('data')
            port.removeAllListeners('error')
            port.removeAllListeners('close')
          } catch (err) {
            // ignorar
          }

          // Intentar cerrar
          if (port.isOpen) {
            try {
              port.close((err) => {
                if (err) console.log(`[DeviceManager] probeGPS(${path}) close error:`, err.message)
                console.log(
                  `[DeviceManager] probeGPS(${path}): ${result ? '✓ GPS detected' : '✗ No GPS'}`
                )
                resolve(result)
              })
              return
            } catch (err) {
              console.log(`[DeviceManager] probeGPS(${path}) close exception:`, err)
            }
          }
        }

        console.log(`[DeviceManager] probeGPS(${path}): ${result ? '✓ GPS detected' : '✗ No GPS'}`)
        resolve(result)
      }

      const timer = setTimeout(() => finish(false, 'timeout'), NMEA_LISTEN_MS)

      try {
        port = new SerialPort({
          path,
          baudRate: GPS_BAUD_RATE,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          autoOpen: false
        })

        // Error handler que ignora si ya terminamos
        port.on('error', (err) => {
          if (!done) {
            console.log(`[DeviceManager] probeGPS(${path}) port error:`, err.message)
            finish(false, 'port error')
          }
        })

        port.open((err) => {
          if (err) {
            if (!done) {
              console.log(`[DeviceManager] probeGPS(${path}) open error:`, err.message)
              finish(false, 'open error')
            }
            return
          }

          if (done) return

          port!.on('data', (chunk: Buffer) => {
            if (done) return

            buffer += chunk.toString('ascii')
            // Tramas NMEA empiezan con $GP, $GN, $GL, $GA
            if (/\$G[PNLA]/.test(buffer)) {
              finish(true, 'NMEA detected')
            }
          })
        })
      } catch (err) {
        console.log(`[DeviceManager] probeGPS(${path}) exception:`, err)
        finish(false, 'exception')
      }
    })
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
