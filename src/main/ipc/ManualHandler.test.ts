import { describe, expect, it, vi } from 'vitest'
import { join } from 'path'
import { IPC_HANDLERS } from '../../shared/ipc-channels'
import { registerManualHandlers, resolveManualPath } from './ManualHandler'
import type { ManualHandlerDeps } from './ManualHandler'
import { createFakeIpc } from './ipcTestUtils'

function makeDeps(openManualSection = vi.fn(async () => {})): ManualHandlerDeps {
  return { openManualSection }
}

describe('registerManualHandlers', () => {
  it('opens the manual at the requested section', async () => {
    const { ipc, handlers } = createFakeIpc()
    const openManualSection = vi.fn(async () => {})
    const deps = makeDeps(openManualSection)

    registerManualHandlers(ipc, deps)

    await handlers.get(IPC_HANDLERS.MANUAL_OPEN_SECTION)!(undefined, 'section-4-3')
    expect(openManualSection).toHaveBeenCalledWith('section-4-3')
  })

  it('sanitizes the section id before opening', async () => {
    const { ipc, handlers } = createFakeIpc()
    const openManualSection = vi.fn(async () => {})
    const deps = makeDeps(openManualSection)

    registerManualHandlers(ipc, deps)

    await handlers.get(IPC_HANDLERS.MANUAL_OPEN_SECTION)!(undefined, 'bad#/../section')
    expect(openManualSection).toHaveBeenCalledWith('badsection')
  })

  it('uses an empty section when none is provided', async () => {
    const { ipc, handlers } = createFakeIpc()
    const openManualSection = vi.fn(async () => {})
    const deps = makeDeps(openManualSection)

    registerManualHandlers(ipc, deps)

    await handlers.get(IPC_HANDLERS.MANUAL_OPEN_SECTION)!(undefined)
    expect(openManualSection).toHaveBeenCalledWith('')
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