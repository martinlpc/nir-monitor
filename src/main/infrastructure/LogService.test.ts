import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { LogService } from './LogService'

function createMockFs() {
  let content = ''
  return {
    appendFile: vi.fn((_path: string, data: string) => {
      content += data
    }),
    statSync: vi.fn(() => ({ size: content.length })),
    readFile: vi.fn((_path: string) => content),
    existsSync: vi.fn(() => true),
    writeFile: vi.fn((_path: string, data: string) => {
      content = data
    }),
    logLines: () => content
  }
}

describe('LogService', () => {
  let fs: ReturnType<typeof createMockFs>

  beforeEach(() => {
    fs = createMockFs()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes formatted log line on console.log', () => {
    const service = new LogService({
      logPath: '/tmp/app.log',
      ...fs
    })
    service.setup()

    console.log('hello')

    expect(fs.appendFile).toHaveBeenCalledTimes(1)
    const written = fs.appendFile.mock.calls[0][1] as string
    expect(written).toMatch(/\[\d{4}-\d{2}-\d{2}T.*\] \[INFO\] hello\n$/)
    service.restore()
  })

  it('writes WARN level on console.warn', () => {
    const service = new LogService({ logPath: '/tmp/app.log', ...fs })
    service.setup()

    console.warn('warning')

    const written = fs.appendFile.mock.calls[0][1] as string
    expect(written).toContain('[WARN]')
    service.restore()
  })

  it('writes ERROR level on console.error', () => {
    const service = new LogService({ logPath: '/tmp/app.log', ...fs })
    service.setup()

    console.error('error')

    const written = fs.appendFile.mock.calls[0][1] as string
    expect(written).toContain('[ERROR]')
    service.restore()
  })

  it('restores original console methods', () => {
    const service = new LogService({ logPath: '/tmp/app.log', ...fs })
    const origLog = console.log
    service.setup()
    expect(console.log).not.toBe(origLog)
    service.restore()
    expect(console.log).toBe(origLog)
  })

  it('trims log when exceeding MAX_LOG_SIZE', () => {
    const bigFs = createMockFs()
    bigFs.statSync = vi.fn(() => ({ size: 6 * 1024 * 1024 }))
    bigFs.readFile = vi.fn(() => 'a\nb\nc\nd\ne\nf\ng\nh\n')
    bigFs.existsSync = vi.fn(() => true)

    const service = new LogService({ logPath: '/tmp/app.log', ...bigFs })
    service.setup()

    console.log('trigger trim')

    expect(bigFs.writeFile).toHaveBeenCalledTimes(1)
    const trimmed = bigFs.writeFile.mock.calls[0][1] as string
    expect(trimmed.length).toBeLessThan(512 * 1024 + 50)
    service.restore()
  })

  it('creates empty log file on setup if missing', () => {
    const missingFs = createMockFs()
    missingFs.existsSync = vi.fn(() => false)
    const service = new LogService({ logPath: '/tmp/app.log', ...missingFs })
    service.setup()

    expect(missingFs.writeFile).toHaveBeenCalledWith('/tmp/app.log', '', 'utf-8')
    service.restore()
  })

  it('getLogPath returns configured path', () => {
    const service = new LogService({ logPath: '/custom/path/app.log', ...fs })
    expect(service.getLogPath()).toBe('/custom/path/app.log')
  })

  it('readLog returns file content', () => {
    fs.readFile = vi.fn(() => 'line1\nline2\n')
    const service = new LogService({ logPath: '/tmp/app.log', ...fs })
    expect(service.readLog()).toBe('line1\nline2\n')
  })

  it('readLog returns empty string when file missing', () => {
    fs.existsSync = vi.fn(() => false)
    const service = new LogService({ logPath: '/tmp/app.log', ...fs })
    expect(service.readLog()).toBe('')
  })
})
