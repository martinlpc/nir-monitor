import * as crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const MAGIC = Buffer.from('NIDB', 'ascii')

function getKey(): Buffer {
  const passphrase = process.env.NIR_DB_ENCRYPTION_KEY
  if (!passphrase) {
    throw new Error(
      'NIR_DB_ENCRYPTION_KEY environment variable is not set.\n' +
        'Create a .env file with: NIR_DB_ENCRYPTION_KEY=<passphrase-compartida>\n' +
        'Or set it before launching the app.'
    )
  }
  return crypto.createHash('sha256').update(passphrase, 'utf8').digest()
}

export function encrypt(plaintext: Buffer): Buffer {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([MAGIC, authTag, iv, encrypted])
}

export function decrypt(ciphertext: Buffer): Buffer {
  const key = getKey()
  const authTag = ciphertext.subarray(
    MAGIC.length,
    MAGIC.length + AUTH_TAG_LENGTH
  )
  const iv = ciphertext.subarray(
    MAGIC.length + AUTH_TAG_LENGTH,
    MAGIC.length + AUTH_TAG_LENGTH + IV_LENGTH
  )
  const payload = ciphertext.subarray(
    MAGIC.length + AUTH_TAG_LENGTH + IV_LENGTH
  )
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(payload), decipher.final()])
}

export function isEncrypted(buffer: Buffer): boolean {
  return buffer.subarray(0, MAGIC.length).equals(MAGIC)
}
