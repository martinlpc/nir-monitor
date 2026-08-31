import { describe, expect, it, vi } from 'vitest'
import { IPC_HANDLERS } from '../../shared/ipc-channels'
import { registerLogsHandlers } from './LogsHandler'
import type { LogsHandlerDeps } from './LogsHandler'
import { createFakeIpc } from './ipcTestUtils'

function makeDeps(overrides: Partial<LogsHandlerDeps> = {}): LogsHandlerDeps {
  return {
    logPath: 'C:\\userData\\app.log',
    readLog: vi.fn(() => 'log content'),
    getDesktopPath: vi.fn(() => 'C:\\Desktop'),
    writeFile: vi.fn(),
    now: vi.fn(() => 1234567890),
    ...overrides
  }
}

describe('registerLogsHandlers', () => {
  it('registers logs:get-path returning the log path', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerLogsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.LOGS_GET_PATH)!(undefined)
    expect(result).toEqual({ success: true, path: 'C:\\userData\\app.log' })
  })

  it('registers logs:export writing the log to the desktop', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerLogsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.LOGS_EXPORT)!(undefined)
    expect(result).toEqual({ success: true, path: 'C:\\Desktop\\nir-monitor-1234567890.log' })
    expect(deps.writeFile).toHaveBeenCalledWith(
      'C:\\Desktop\\nir-monitor-1234567890.log',
      'log content'
    )
  })

  it('returns an error result when exporting fails', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps({
      writeFile: vi.fn(() => {
        throw new Error('disk full')
      })
    })

    registerLogsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.LOGS_EXPORT)!(undefined)
    expect(result).toEqual({ success: false, error: 'disk full' })
  })
})
