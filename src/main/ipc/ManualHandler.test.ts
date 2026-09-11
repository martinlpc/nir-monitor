import { describe, expect, it, vi } from 'vitest'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { IPC_HANDLERS } from '../../shared/ipc-channels'
import { registerManualHandlers, resolveManualPath } from './ManualHandler'
import type { ManualHandlerDeps } from './ManualHandler'
import { createFakeIpc } from './ipcTestUtils'

function makeDeps(manualPath = '/app/resources/manual.html'): ManualHandlerDeps {
  return {
    manualPath,
    openUrl: vi.fn(async () => {})
  }
}

function manualUrl(manualPath: string, section: string): string {
  return `${pathToFileURL(manualPath).href}#${section}`
}

describe('registerManualHandlers', () => {
  it('opens the manual at the requested section anchor', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps('/app/manual.html')

    registerManualHandlers(ipc, deps)

    await handlers.get(IPC_HANDLERS.MANUAL_OPEN_SECTION)!(undefined, 'section-4-3')
    expect(deps.openUrl).toHaveBeenCalledWith(manualUrl('/app/manual.html', 'section-4-3'))
  })

  it('sanitizes the section id before building the url', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps('/app/manual.html')

    registerManualHandlers(ipc, deps)

    await handlers.get(IPC_HANDLERS.MANUAL_OPEN_SECTION)!(undefined, 'bad#/../section')
    expect(deps.openUrl).toHaveBeenCalledWith(manualUrl('/app/manual.html', 'badsection'))
  })

  it('uses an empty anchor when no section is provided', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps('/app/manual.html')

    registerManualHandlers(ipc, deps)

    await handlers.get(IPC_HANDLERS.MANUAL_OPEN_SECTION)!(undefined)
    expect(deps.openUrl).toHaveBeenCalledWith(manualUrl('/app/manual.html', ''))
  })

  it('resolves the bundled manual from resources when packaged', () => {
    const path = resolveManualPath(true, '/tmp/resources', '/tmp/cwd')
    expect(path).toBe(join('/tmp/resources', 'manual.html'))
  })

  it('resolves the repo docs folder when not packaged', () => {
    const path = resolveManualPath(false, '/tmp/resources', '/tmp/cwd')
    expect(path).toBe(join('/tmp/cwd', 'docs', 'manual.html'))
  })
})