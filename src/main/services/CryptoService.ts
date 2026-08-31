import * as crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const MAGIC = Buffer.from('NIDB', 'ascii')

export class CryptoService {
  private readonly key: Buffer

  constructor(passphrase: string) {
    this.key = crypto.createHash('sha256').update(passphrase, 'utf8').digest()
  }

  encrypt(plaintext: Buffer): Buffer {
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const authTag = cipher.getAuthTag()
    return Buffer.concat([MAGIC, authTag, iv, encrypted])
  }

  decrypt(ciphertext: Buffer): Buffer {
    const authTag = ciphertext.subarray(MAGIC.length, MAGIC.length + AUTH_TAG_LENGTH)
    const iv = ciphertext.subarray(
      MAGIC.length + AUTH_TAG_LENGTH,
      MAGIC.length + AUTH_TAG_LENGTH + IV_LENGTH
    )
    const payload = ciphertext.subarray(MAGIC.length + AUTH_TAG_LENGTH + IV_LENGTH)
    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv)
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(payload), decipher.final()])
  }
}

export function isEncrypted(buffer: Buffer): boolean {
  return buffer.subarray(0, MAGIC.length).equals(MAGIC)
}

export function createCryptoServiceFromEnv(): CryptoService {
  const passphrase = process.env.NIR_DB_ENCRYPTION_KEY
  if (!passphrase) {
    throw new Error(
      'NIR_DB_ENCRYPTION_KEY no está configurada.\n\n' +
        'En desarrollo: crear un archivo .env en la raíz del proyecto con:\n' +
        '  NIR_DB_ENCRYPTION_KEY=<passphrase>\n\n' +
        'En producción: la clave se configura automáticamente durante la instalación.\n' +
        '  Reinstale la aplicación o contacte al administrador del sistema.'
    )
  }
  return new CryptoService(passphrase)
}
