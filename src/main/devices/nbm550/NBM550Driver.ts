import { SerialPort } from 'serialport'
import { EventEmitter } from 'events'
import { NBM550Parser } from './NBM550Parser'
import type { NBM550Config, NBM550Sample } from './nbm550.types'
import type { IDeviceDriver, DeviceStatus, DeviceMeta } from '../../../shared/device.types'

const RESPONSE_TIMEOUT_MS = 3000
const INIT_DELAY_MS = 500

export class NBM550Driver extends EventEmitter implements IDeviceDriver {
  readonly meta: DeviceMeta
  status: DeviceStatus = 'disconnected'

  private port: SerialPort | null = null
  private parser: NBM550Parser
  private config: NBM550Config
  private responseBuffer: string = ''
  private pendingResolve: ((val: string) => void) | null = null
  private pendingTimeout: NodeJS.Timeout | null = null

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

    await this.openPort()
    this.attachDataListener()

    // Secuencia de inicialización
    await this.delay(INIT_DELAY_MS)
    await this.sendCommand('REMOTE ON')
    await this.delay(INIT_DELAY_MS)
    await this.sendCommand(`SAMPLE_RATE 5`) //5 Hz para MAXHOLD
    await this.sendCommand('MEAS_VIEW NORMAL') // Result1 = RSS (RT)
    await this.sendCommand('RESULT_TYPE MAX') //MAXHOLD acumulado
    await this.sendCommand(`RESULT_UNIT ${this.config.unit}`)

    // Confirmar unidad activa
    const unitRaw = await this.query('RESULT_UNIT?')
    const unit = this.parser.parseUnit(unitRaw)
    if (unit) this.parser.setUnit(unit)

    this.setStatus('connected')
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
    return this.parser.parseMeasurement(raw)
  }

  // ── Serial I/O ───────────────────────────────────────────

  // Envía comando y espera respuesta (el NBM responde a todo, incluso Set)
  private query(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.port?.isOpen) {
        return reject(new Error('Puerto no abierto'))
      }

      this.pendingResolve = resolve
      this.responseBuffer = ''

      this.pendingTimeout = setTimeout(() => {
        this.pendingResolve = null
        reject(new Error(`Timeout esperando respuesta a: ${command}`))
      }, RESPONSE_TIMEOUT_MS)

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

      // La respuesta termina en ";\r" según el protocolo
      if (this.responseBuffer.includes(';')) {
        const response = this.responseBuffer
        this.responseBuffer = ''

        if (this.pendingResolve) {
          clearTimeout(this.pendingTimeout!)
          const resolve = this.pendingResolve
          this.pendingResolve = null
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
