import { SerialPort } from 'serialport'
import { EventEmitter } from 'events'
import { NBM550Parser } from './NBM550Parser'
import type { NBM550Config, NBM550Sample } from './nbm550.types'
import type { IDeviceDriver, DeviceStatus, DeviceMeta } from '../../../shared/device.types'

const RESPONSE_TIMEOUT_MS = 5000 // Aumentado de 3s a 5s para mayor tiempo de respuesta
const INIT_DELAY_MS = 1000 // Aumentado de 500ms a 1s tras abrir puerto

export class NBM550Driver extends EventEmitter implements IDeviceDriver {
  readonly meta: DeviceMeta
  status: DeviceStatus = 'disconnected'

  private port: SerialPort | null = null
  private parser: NBM550Parser
  private config: NBM550Config
  private responseBuffer: string = ''
  private pendingResolve: ((val: string) => void) | null = null
  private pendingTimeout: NodeJS.Timeout | null = null
  private currentBattery: number = 100

  constructor(config: NBM550Config) {
    super()
    this.config = config
    this.parser = new NBM550Parser()

    this.meta = {
      id: 'nbm550',
      name: 'Narda NBM-550',
      type: 'emf',
      port: config.port,
      baudRate: config.baudRate
    }
  }

  // Para probe rápida: solo verificar que responde (sin esperar estatus de conexión completa)
  async quickProbe(): Promise<void> {
    try {
      this.setStatus('connecting')
      console.log(`[NBM550Driver] Quick probe to ${this.config.port}...`)

      this.port = new SerialPort({
        path: this.config.port,
        baudRate: this.config.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        autoOpen: false
      })

      await this.openPort()
      console.log(`[NBM550Driver] Port opened (probe): ${this.config.port}`)

      this.attachDataListener()
      await this.delay(INIT_DELAY_MS)

      // Solo enviar REMOTE ON para probe - si responde, es un NBM550
      console.log(`[NBM550Driver] Quick probe: sending REMOTE ON...`)
      await this.sendCommand('REMOTE ON')

      console.log(`[NBM550Driver] Quick probe successful!`)
      // NO cerramos aquí - dejamos que se cierre en disconnect()
    } catch (err) {
      console.error(`[NBM550Driver] Quick probe failed:`, err)
      this.setStatus('error')
      throw err
    }
  }

  async connect(): Promise<void> {
    try {
      this.setStatus('connecting')
      console.log(`[NBM550Driver] Connecting to ${this.config.port}...`)

      this.port = new SerialPort({
        path: this.config.port,
        baudRate: this.config.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        autoOpen: false
      })

      await this.openPort()
      console.log(`[NBM550Driver] Port opened: ${this.config.port}`)

      this.attachDataListener()

      // Secuencia de inicialización
      await this.delay(INIT_DELAY_MS)

      console.log(`[NBM550Driver] Sending REMOTE ON...`)
      await this.sendCommand('REMOTE ON')

      await this.delay(INIT_DELAY_MS)

      console.log(`[NBM550Driver] Sending SAMPLE_RATE 5...`)
      await this.sendCommand('SAMPLE_RATE 5')

      console.log(`[NBM550Driver] Sending MEAS_VIEW NORMAL...`)
      await this.sendCommand('MEAS_VIEW NORMAL')

      console.log(`[NBM550Driver] Sending RESULT_TYPE MAX...`)
      await this.sendCommand('RESULT_TYPE MAX')

      console.log(`[NBM550Driver] Sending RESULT_UNIT ${this.config.unit}...`)
      await this.sendCommand(`RESULT_UNIT ${this.config.unit}`)

      // Confirmar unidad activa
      console.log(`[NBM550Driver] Querying RESULT_UNIT?...`)
      const unitRaw = await this.query('RESULT_UNIT?')
      console.log(`[NBM550Driver] RESULT_UNIT? response:`, unitRaw)

      const unit = this.parser.parseUnit(unitRaw)
      if (unit) {
        console.log(`[NBM550Driver] Unit set to: ${unit}`)
        this.parser.setUnit(unit)
      }

      console.log(`[NBM550Driver] Connection successful, setting status to connected`)
      this.setStatus('connected')
    } catch (err) {
      console.error(`[NBM550Driver] Connection error:`, err)
      this.setStatus('error')
      throw err
    }
  }

  async disconnect(): Promise<void> {
    if (this.port?.isOpen) {
      await this.sendCommand('REMOTE OFF').catch(() => {})
      await this.closePort()
    }

    this.setStatus('disconnected')
  }

  isConnected(): boolean {
    return this.status === 'connected' && (this.port?.isOpen ?? false)
  }

  async resetMaxHold(): Promise<void> {
    await this.sendCommand('RESET_MAX')
  }

  // ── Measurement ──────────────────────────────────────────────

  async readMeasurement(): Promise<NBM550Sample | null> {
    const raw = await this.query('MEAS?')

    // Detectar código de error del NBM (ej: "412;" cuando el dispositivo falla)
    if (this.parser.isErrorResponse(raw)) {
      const code = this.parser.parseErrorCode(raw)
      console.error(`[NBM550Driver] readMeasurement: device returned error code ${code}`)
      this.setStatus('error')
      this.emit('error', new Error(`NBM-550 error code ${code}`))
      return null
    }

    const sample = this.parser.parseMeasurement(raw)
    if (sample) {
      // Usar la batería actualizada más recientemente
      sample.battery = this.currentBattery
    }
    return sample
  }

  async readBattery(): Promise<number | null> {
    try {
      const raw = await this.query('BATTERY?')
      const battery = this.parser.parseBattery(raw)
      if (battery !== null) {
        this.currentBattery = battery
      }
      return battery
    } catch (err) {
      console.error(`[NBM550Driver] readBattery error:`, err)
      return null
    }
  }

  // ── Serial I/O ───────────────────────────────────────────

  // Envía comando y espera respuesta (el NBM responde a todo, incluso Set)
  private query(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.port?.isOpen) {
        return reject(new Error('Puerto no abierto'))
      }

      this.pendingResolve = resolve
      this.responseBuffer = '' // LIMPIO el buffer antes de cada comando

      const timeout = setTimeout(() => {
        this.pendingResolve = null
        reject(new Error(`Timeout esperando respuesta a: ${command}`))
      }, RESPONSE_TIMEOUT_MS)

      this.pendingTimeout = timeout

      this.port.write(`${command};\r\n`, (err) => {
        if (err) {
          clearTimeout(this.pendingTimeout!)
          this.pendingResolve = null
          reject(err)
        }
      })
    })
  }

  // Para Set Commands donde solo nos importa confirmar que no hubo error
  private async sendCommand(command: string): Promise<void> {
    const response = await this.query(command)
    const code = this.parser.parseErrorCode(response)
    if (code !== 0) {
      throw new Error(`NBM-550 error ${code} en comando: ${command}`)
    }
  }

  private attachDataListener(): void {
    this.port!.on('data', (chunk: Buffer) => {
      this.responseBuffer += chunk.toString('ascii')

      // La respuesta termina en ";" según el protocolo
      const semicolonIndex = this.responseBuffer.indexOf(';')
      if (semicolonIndex !== -1) {
        // Extraer la respuesta hasta el ; (inclusive)
        const response = this.responseBuffer.slice(0, semicolonIndex + 1)
        this.responseBuffer = this.responseBuffer.slice(semicolonIndex + 1)

        if (this.pendingResolve) {
          clearTimeout(this.pendingTimeout!)
          const resolve = this.pendingResolve
          this.pendingResolve = null
          this.pendingTimeout = null
          resolve(response)
        }
      }
    })

    this.port!.on('error', (err: Error) => {
      this.setStatus('error')
      this.emit('error', err)
    })

    this.port!.on('close', () => {
      this.setStatus('disconnected')
    })
  }

  // ── Helpers ──────────────────────────────────────────────

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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
