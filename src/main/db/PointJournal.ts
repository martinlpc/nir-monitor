import * as fs from 'fs'
import * as path from 'path'
import type { GeoTimestamp } from '../../shared/GeoTimestamp'
import { writeFully } from './atomicWrite'

export interface JournalCipher {
  encrypt(plaintext: Buffer): Buffer
  decrypt(ciphertext: Buffer): Buffer
}

export interface JournalEntry {
  sessionId: string
  point: GeoTimestamp
}

export interface JournalReadResult {
  entries: JournalEntry[]
  /** Bytes al final del archivo que no forman un registro completo y válido */
  discardedBytes: number
}

const LENGTH_PREFIX_BYTES = 4
const MAX_RECORD_BYTES = 64 * 1024

function isJournalEntry(value: unknown): value is JournalEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Partial<JournalEntry>
  const point = entry.point as Partial<GeoTimestamp> | undefined
  return (
    typeof entry.sessionId === 'string' &&
    typeof point === 'object' &&
    point !== null &&
    typeof point.id === 'string' &&
    typeof point.timestamp === 'number' &&
    typeof point.position === 'object' &&
    point.position !== null &&
    typeof point.emf === 'object' &&
    point.emf !== null
  )
}

/**
 * Journal append-only de puntos de medición.
 *
 * La base sql.js vive en memoria y se vuelca entera a disco cada tanto. Para
 * que un cuelgue o un corte de energía no pierda los puntos capturados desde
 * el último volcado, cada punto se agrega acá y se fuerza a disco (fsync)
 * antes de darlo por guardado. Al arrancar, el repositorio reproduce el
 * journal sobre la base y lo vacía.
 *
 * Formato: registros consecutivos `[longitud uint32 BE][payload]`, donde el
 * payload es el JSON del punto, cifrado si hay cipher.
 */
export class PointJournal {
  private fd: number | null = null

  constructor(
    private readonly filePath: string,
    private readonly cipher: JournalCipher | null = null
  ) {}

  private open(): number {
    if (this.fd === null) {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      this.fd = fs.openSync(this.filePath, 'a')
    }
    return this.fd
  }

  /** Agrega un punto y lo fuerza a disco. Lanza si la escritura falla. */
  append(sessionId: string, point: GeoTimestamp): void {
    const json = Buffer.from(JSON.stringify({ sessionId, point }), 'utf-8')
    const payload = this.cipher ? this.cipher.encrypt(json) : json
    const record = Buffer.allocUnsafe(LENGTH_PREFIX_BYTES + payload.length)
    record.writeUInt32BE(payload.length, 0)
    payload.copy(record, LENGTH_PREFIX_BYTES)

    const fd = this.open()
    writeFully(fd, record)
    fs.fsyncSync(fd)
  }

  /**
   * Lee todos los registros válidos. Se detiene en el primer registro
   * incompleto o ilegible (típicamente el último, cortado por un apagón).
   */
  readAll(): JournalReadResult {
    if (!fs.existsSync(this.filePath)) return { entries: [], discardedBytes: 0 }

    const data = fs.readFileSync(this.filePath)
    const entries: JournalEntry[] = []
    let offset = 0

    while (offset + LENGTH_PREFIX_BYTES <= data.length) {
      const length = data.readUInt32BE(offset)
      const start = offset + LENGTH_PREFIX_BYTES
      const end = start + length
      if (length === 0 || length > MAX_RECORD_BYTES || end > data.length) break

      try {
        const payload = data.subarray(start, end)
        const json = this.cipher ? this.cipher.decrypt(payload) : payload
        const parsed: unknown = JSON.parse(json.toString('utf-8'))
        if (!isJournalEntry(parsed)) break
        entries.push(parsed)
      } catch {
        break
      }
      offset = end
    }

    return { entries, discardedBytes: data.length - offset }
  }

  /** Vacía el journal. Se llama después de volcar la base completa a disco. */
  clear(): void {
    if (this.fd === null && !fs.existsSync(this.filePath)) return
    // Windows no permite truncar un descriptor abierto en modo append:
    // se cierra, se reabre truncando y el próximo append lo vuelve a abrir.
    this.close()
    const fd = fs.openSync(this.filePath, 'w')
    try {
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
  }

  close(): void {
    if (this.fd !== null) {
      fs.closeSync(this.fd)
      this.fd = null
    }
  }
}
