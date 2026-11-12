import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { PointJournal } from './PointJournal'
import { writeFileAtomic } from './atomicWrite'
import { CryptoService } from '../services/CryptoService'
import type { GeoTimestamp } from '../../shared/GeoTimestamp'

function makePoint(seq: number): GeoTimestamp {
  return {
    id: `point-${seq}`,
    sessionId: 'session-1',
    sequenceNumber: seq,
    timestamp: 1_700_000_000_000 + seq * 1000,
    position: { lat: -38.95, lon: -68.05, alt: 271 },
    emf: { deviceId: 'nbm550', rawMeasurement: 1.5, unit: 'V/m' },
    correctedMeasurement: 1.62
  }
}

describe('PointJournal', () => {
  let dir: string
  let filePath: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nir-journal-'))
    filePath = path.join(dir, 'nested', 'sessions.journal')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns no entries when the file does not exist', () => {
    const journal = new PointJournal(filePath)
    expect(journal.readAll()).toEqual({ entries: [], discardedBytes: 0 })
    expect(() => journal.clear()).not.toThrow()
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('round-trips appended points in order', () => {
    const journal = new PointJournal(filePath)
    journal.append('session-1', makePoint(1))
    journal.append('session-1', makePoint(2))
    journal.append('session-2', makePoint(3))
    journal.close()

    const { entries, discardedBytes } = new PointJournal(filePath).readAll()
    expect(discardedBytes).toBe(0)
    expect(entries.map((e) => e.sessionId)).toEqual(['session-1', 'session-1', 'session-2'])
    expect(entries.map((e) => e.point.id)).toEqual(['point-1', 'point-2', 'point-3'])
    expect(entries[0].point).toEqual(makePoint(1))
  })

  it('encrypts records when a cipher is provided', () => {
    const cipher = new CryptoService('journal-test-key')
    const journal = new PointJournal(filePath, cipher)
    journal.append('session-1', makePoint(1))
    journal.close()

    const raw = fs.readFileSync(filePath)
    expect(raw.includes(Buffer.from('point-1'))).toBe(false)

    expect(new PointJournal(filePath, cipher).readAll().entries).toHaveLength(1)
    // Con otra clave el registro no se puede autenticar y se descarta
    const wrongKey = new PointJournal(filePath, new CryptoService('other-key')).readAll()
    expect(wrongKey.entries).toEqual([])
    expect(wrongKey.discardedBytes).toBe(raw.length)
  })

  it('keeps complete records and discards a record cut off mid-write', () => {
    const journal = new PointJournal(filePath)
    journal.append('session-1', makePoint(1))
    journal.append('session-1', makePoint(2))
    journal.close()

    const complete = fs.readFileSync(filePath)
    journal.append('session-1', makePoint(3))
    journal.close()
    const withThird = fs.readFileSync(filePath)
    // Simula un apagón: el tercer registro quedó escrito a medias
    const torn = withThird.subarray(0, complete.length + 10)
    fs.writeFileSync(filePath, torn)

    const { entries, discardedBytes } = new PointJournal(filePath).readAll()
    expect(entries.map((e) => e.point.id)).toEqual(['point-1', 'point-2'])
    expect(discardedBytes).toBe(10)
  })

  it('stops at garbage instead of throwing', () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, Buffer.from([0, 0, 0, 5, 1, 2, 3, 4, 5, 9, 9]))

    const result = new PointJournal(filePath).readAll()
    expect(result.entries).toEqual([])
    expect(result.discardedBytes).toBe(11)
  })

  it('rejects records that are valid JSON but not a point entry', () => {
    const payload = Buffer.from(JSON.stringify({ sessionId: 'x', point: { id: 1 } }))
    const record = Buffer.alloc(4 + payload.length)
    record.writeUInt32BE(payload.length, 0)
    payload.copy(record, 4)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, record)

    expect(new PointJournal(filePath).readAll().entries).toEqual([])
  })

  it('clears the journal and keeps accepting appends', () => {
    const journal = new PointJournal(filePath)
    journal.append('session-1', makePoint(1))
    journal.clear()
    expect(fs.statSync(filePath).size).toBe(0)

    journal.append('session-1', makePoint(2))
    journal.close()
    expect(new PointJournal(filePath).readAll().entries.map((e) => e.point.id)).toEqual(['point-2'])
  })
})

describe('writeFileAtomic', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nir-atomic-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('creates the file and leaves no temporary file behind', () => {
    const target = path.join(dir, 'sessions.db')
    writeFileAtomic(target, Buffer.from('first'))

    expect(fs.readFileSync(target, 'utf-8')).toBe('first')
    expect(fs.readdirSync(dir)).toEqual(['sessions.db'])
  })

  it('replaces an existing file completely', () => {
    const target = path.join(dir, 'sessions.db')
    writeFileAtomic(target, Buffer.from('a much longer first version'))
    writeFileAtomic(target, Buffer.from('second'))

    expect(fs.readFileSync(target, 'utf-8')).toBe('second')
    expect(fs.readdirSync(dir)).toEqual(['sessions.db'])
  })

  it('keeps the previous file when the write cannot start', () => {
    const target = path.join(dir, 'missing-dir', 'sessions.db')
    expect(() => writeFileAtomic(target, Buffer.from('x'))).toThrow()
    expect(fs.existsSync(target)).toBe(false)
  })
})
