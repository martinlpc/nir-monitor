import { describe, expect, it, vi } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { IPC_HANDLERS } from '../../shared/ipc-channels'
import { registerZadigHandlers, resolveZadigPath } from './ZadigHandler'
import type { ZadigHandlerDeps } from './ZadigHandler'
import { createFakeIpc } from './ipcTestUtils'

function makeDeps(zadigPath = '/app/resources/drivers/zadig/zadig-2.9.exe'): ZadigHandlerDeps {
  return {
    zadigPath,
    openPath: vi.fn(async () => '')
  }
}

function withTempExecutable(run: (file: string) => Promise<void>): Promise<void> {
  const dir = join(tmpdir(), `zadig-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'zadig-2.9.exe')
  writeFileSync(file, '')
  return run(file).finally(() => rmSync(dir, { recursive: true, force: true }))
}

describe('registerZadigHandlers', () => {
  it('opens the bundled Zadig executable when present', async () => {
    await withTempExecutable(async (file) => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps(file)

      registerZadigHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.ZADIG_OPEN)!(undefined)
      expect(deps.openPath).toHaveBeenCalledWith(file)
      expect(result).toEqual({ success: true })
    })
  })

  it('returns an error when the Zadig executable is missing', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps('/nonexistent/zadig-2.9.exe')

    registerZadigHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.ZADIG_OPEN)!(undefined)
    expect(result).toEqual({ success: false, error: expect.stringContaining('Zadig') })
    expect(deps.openPath).not.toHaveBeenCalled()
  })

  it('returns the openPath error message when launching fails', async () => {
    await withTempExecutable(async (file) => {
      const { ipc, handlers } = createFakeIpc()
      const deps = makeDeps(file)
      vi.mocked(deps.openPath).mockResolvedValueOnce('failed to launch')

      registerZadigHandlers(ipc, deps)

      const result = await handlers.get(IPC_HANDLERS.ZADIG_OPEN)!(undefined)
      expect(result).toEqual({ success: false, error: 'failed to launch' })
    })
  })

  it('resolves the bundled path from resources when packaged', () => {
    const path = resolveZadigPath(true, '/tmp/resources', '/tmp/cwd')
    expect(path).toBe(join('/tmp/resources', 'drivers', 'zadig', 'zadig-2.9.exe'))
  })

  it('resolves the repo resources folder when not packaged', () => {
    const path = resolveZadigPath(false, '/tmp/resources', '/tmp/cwd')
    expect(path).toBe(join('/tmp/cwd', 'resources', 'drivers', 'zadig', 'zadig-2.9.exe'))
  })
})