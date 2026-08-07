import { describe, expect, it, vi, afterEach } from 'vitest'
import type { Mock } from 'vitest'

import { AlertLogger, getDefaultAlertLogger } from './AlertLogger'

function makeLogger(): {
  logger: AlertLogger
  appendFile: Mock<(path: string, data: string, cb: (err: Error | null) => void) => void>
} {
  const appendFile = vi.fn((_path: string, _data: string, cb: (err: Error | null) => void) =>
    cb(null)
  )
  const logger = new AlertLogger({ getLogPath: () => '/data/alert.log', appendFile })
  return { logger, appendFile }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AlertLogger', () => {
  it('writes a formatted INFO line to the log path', () => {
    const { logger, appendFile } = makeLogger()

    logger.log('hello')

    expect(appendFile).toHaveBeenCalledTimes(1)
    expect(appendFile.mock.calls[0][0]).toBe('/data/alert.log')
    expect(appendFile.mock.calls[0][1]).toMatch(/\[\d{4}-\d{2}-\d{2}T.*\] \[INFO\] hello\n$/)
    expect(appendFile.mock.calls[0][2]).toBeTypeOf('function')
  })

  it('writes the alert type uppercased', () => {
    const { logger, appendFile } = makeLogger()

    logger.log('cuidado', 'warning')

    expect(appendFile.mock.calls[0][1]).toContain('[WARNING]')
  })

  it('defaults the type to info', () => {
    const { logger, appendFile } = makeLogger()

    logger.log('mensaje')

    expect(appendFile.mock.calls[0][1]).toContain('[INFO]')
  })

  it('reports write errors through console.error', () => {
    const { logger, appendFile } = makeLogger()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logger.log('mensaje')
    const cb = appendFile.mock.calls[0][2] as (err: Error | null) => void
    cb(new Error('disk full'))

    expect(errorSpy).toHaveBeenCalledWith(
      '[AlertLogger] Error writing alert log:',
      expect.any(Error)
    )
  })

  it('getDefaultAlertLogger returns a singleton', () => {
    expect(getDefaultAlertLogger()).toBe(getDefaultAlertLogger())
  })
})
