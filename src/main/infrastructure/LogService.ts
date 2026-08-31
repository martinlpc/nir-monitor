import { appendFileSync, statSync, readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

const MAX_LOG_SIZE = 5 * 1024 * 1024
const KEEP_TAIL = 512 * 1024

export interface LogServiceOptions {
  logPath: string
  appendFile: (path: string, data: string, encoding: BufferEncoding) => void
  statSync: (path: string) => { size: number }
  readFile: (path: string, encoding: BufferEncoding) => string
  existsSync: (path: string) => boolean
  writeFile: (path: string, data: string, encoding: BufferEncoding) => void
}

export class LogService {
  private origLog!: (...args: unknown[]) => void
  private origWarn!: (...args: unknown[]) => void
  private origError!: (...args: unknown[]) => void

  constructor(private opts: LogServiceOptions) {}

  private writeLog(level: string, args: unknown[]): void {
    const ts = new Date().toISOString()
    const message = args
      .map((a) => (typeof a === 'string' ? a : (JSON.stringify(a, null, 0) ?? String(a))))
      .join(' ')
    const line = `[${ts}] [${level}] ${message}\n`

    try {
      this.opts.appendFile(this.opts.logPath, line, 'utf-8')
      const size = this.opts.statSync(this.opts.logPath).size
      if (size > MAX_LOG_SIZE) {
        const content = this.opts.readFile(this.opts.logPath, 'utf-8')
        const trimmed = content.slice(-KEEP_TAIL)
        const firstNewline = trimmed.indexOf('\n')
        this.opts.writeFile(
          this.opts.logPath,
          firstNewline >= 0 ? trimmed.slice(firstNewline + 1) : trimmed,
          'utf-8'
        )
      }
    } catch {
      // Silently fail
    }
  }

  setup(): void {
    if (!this.opts.existsSync(this.opts.logPath)) {
      try {
        this.opts.writeFile(this.opts.logPath, '', 'utf-8')
      } catch {
        // Ignore
      }
    }

    this.origLog = console.log
    this.origWarn = console.warn
    this.origError = console.error

    console.log = (...args: unknown[]): void => {
      this.origLog(...args)
      this.writeLog('INFO', args)
    }

    console.warn = (...args: unknown[]): void => {
      this.origWarn(...args)
      this.writeLog('WARN', args)
    }

    console.error = (...args: unknown[]): void => {
      this.origError(...args)
      this.writeLog('ERROR', args)
    }
  }

  restore(): void {
    console.log = this.origLog
    console.warn = this.origWarn
    console.error = this.origError
  }

  getLogPath(): string {
    return this.opts.logPath
  }

  readLog(): string {
    if (!this.opts.existsSync(this.opts.logPath)) return ''
    return this.opts.readFile(this.opts.logPath, 'utf-8')
  }
}

export function setupLogService(): void {
  getDefaultLogService().setup()
}

export function getAppLogPath(): string {
  return getDefaultLogService().getLogPath()
}

export function readAppLog(): string {
  return getDefaultLogService().readLog()
}

let defaultService: LogService | undefined

function getDefaultLogService(): LogService {
  if (defaultService) return defaultService
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron')
  defaultService = new LogService({
    logPath: join(app.getPath('userData'), 'app.log'),
    appendFile: appendFileSync,
    statSync,
    readFile: readFileSync,
    existsSync,
    writeFile: writeFileSync
  })
  return defaultService
}
