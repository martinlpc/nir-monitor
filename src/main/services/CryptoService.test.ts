import { describe, expect, it, afterEach, vi } from 'vitest'
import { CryptoService, isEncrypted } from './CryptoService'

const PASSPHRASE = 'test-passphrase-123'
const MAGIC = Buffer.from('NIDB', 'ascii')

describe('CryptoService', () => {
  const service = new CryptoService(PASSPHRASE)

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('roundtrips small payloads', () => {
    const plaintext = Buffer.from('hola mundo', 'utf-8')
    expect(service.decrypt(service.encrypt(plaintext)).toString('utf-8')).toBe('hola mundo')
  })

  it('roundtrips empty payload', () => {
    const plaintext = Buffer.alloc(0)
    expect(service.decrypt(service.encrypt(plaintext))).toHaveLength(0)
  })

  it('roundtrips multi-kilobyte payloads', () => {
    const plaintext = Buffer.alloc(64 * 1024, 'a')
    expect(service.decrypt(service.encrypt(plaintext))).toEqual(plaintext)
  })

  it('produces different ciphertext for same plaintext (random IV)', () => {
    const plaintext = Buffer.from('repeat', 'utf-8')
    const first = service.encrypt(plaintext)
    const second = service.encrypt(plaintext)
    expect(first).not.toEqual(second)
  })

  it('throws when decrypting with the wrong passphrase', () => {
    const wrong = new CryptoService('wrong-passphrase')
    const ciphertext = service.encrypt(Buffer.from('secreto', 'utf-8'))
    expect(() => wrong.decrypt(ciphertext)).toThrow()
  })

  it('throws when ciphertext is tampered', () => {
    const ciphertext = service.encrypt(Buffer.from('secreto', 'utf-8'))
    ciphertext[ciphertext.length - 1] = (ciphertext[ciphertext.length - 1] ^ 0xff) as number
    expect(() => service.decrypt(ciphertext)).toThrow()
  })

  it('isEncrypted detects own output and rejects plain/random buffers', () => {
    expect(isEncrypted(service.encrypt(Buffer.from('x')))).toBe(true)
    expect(isEncrypted(Buffer.from('plain data'))).toBe(false)
    expect(isEncrypted(Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff]))).toBe(false)
  })

  it('preserves v1 format magic prefix (legacy compatibility)', () => {
    const encrypted = service.encrypt(Buffer.from('legacy', 'utf-8'))
    expect(encrypted.subarray(0, MAGIC.length).equals(MAGIC)).toBe(true)
  })

  it('module-level encrypt/decrypt work when env key is set', async () => {
    vi.stubEnv('NIR_DB_ENCRYPTION_KEY', PASSPHRASE)
    const mod = await import('./CryptoService')
    const ciphertext = mod.encrypt(Buffer.from('env key', 'utf-8'))
    expect(mod.decrypt(ciphertext).toString('utf-8')).toBe('env key')
  })
})
