import { appendFileSync, statSync, readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const MAX_LOG_SIZE = 5 * 1024 * 1024
const KEEP_TAIL = 512 * 1024

function getLogPath(): string {
  const userData = app.getPath('userData')
  return join(userData, 'app.log')
}

function writeLog(level: string, args: unknown[]): void {
  const ts = new Date().toISOString()
  const message = args
    .map((a) => (typeof a === 'string' ? a : (JSON.stringify(a, null, 0) ?? String(a))))
    .join(' ')
  const line = `[${ts}] [${level}] ${message}\n`
  const logPath = getLogPath()

  try {
    appendFileSync(logPath, line, 'utf-8')
    const size = statSync(logPath).size
    if (size > MAX_LOG_SIZE) {
      const content = readFileSync(logPath, 'utf-8')
      const trimmed = content.slice(-KEEP_TAIL)
      const firstNewline = trimmed.indexOf('\n')
      writeFileSync(logPath, firstNewline >= 0 ? trimmed.slice(firstNewline + 1) : trimmed, 'utf-8')
    }
  } catch {
    // Silently fail — can't log about logging
  }
}

export function setupLogService(): void {
  const logPath = getLogPath()
  if (!existsSync(logPath)) {
    try {
      writeFileSync(logPath, '', 'utf-8')
    } catch {
      // Ignore
    }
  }

  const origLog = console.log
  const origWarn = console.warn
  const origError = console.error

  console.log = (...args: unknown[]): void => {
    origLog(...args)
    writeLog('INFO', args)
  }

  console.warn = (...args: unknown[]): void => {
    origWarn(...args)
    writeLog('WARN', args)
  }

  console.error = (...args: unknown[]): void => {
    origError(...args)
    writeLog('ERROR', args)
  }
}

export function getAppLogPath(): string {
  return getLogPath()
}

export function readAppLog(): string {
  const logPath = getLogPath()
  if (!existsSync(logPath)) return ''
  return readFileSync(logPath, 'utf-8')
}
