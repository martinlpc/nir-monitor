import * as fs from 'fs'

const RENAME_RETRIES = 5
const RENAME_RETRY_DELAY_MS = 40
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])

/**
 * Escribe todo el buffer en el descriptor. `writeSync` puede escribir menos
 * bytes de los pedidos, por eso se repite hasta completar.
 */
export function writeFully(fd: number, data: Buffer): void {
  let offset = 0
  while (offset < data.length) {
    offset += fs.writeSync(fd, data, offset, data.length - offset)
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * En Windows el rename falla de forma transitoria si otro proceso (antivirus,
 * indexador) tiene abierto el archivo destino. Se reintenta unas pocas veces.
 */
function renameWithRetry(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? ''
      if (attempt >= RENAME_RETRIES || !RETRYABLE_RENAME_CODES.has(code)) throw err
      sleepSync(RENAME_RETRY_DELAY_MS * (attempt + 1))
    }
  }
}

/**
 * Reemplaza `filePath` de forma atómica: escribe un temporal, lo fuerza a
 * disco y lo renombra sobre el destino. Ante un corte de energía el archivo
 * queda con el contenido anterior completo o con el nuevo completo, nunca a
 * medias.
 */
export function writeFileAtomic(filePath: string, data: Buffer): void {
  const tmpPath = `${filePath}.tmp`
  const fd = fs.openSync(tmpPath, 'w')
  try {
    writeFully(fd, data)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  renameWithRetry(tmpPath, filePath)
}
