import { describe, expect, it, vi } from 'vitest'
import { createManualOpener } from './ManualWindow'
import type { ManualWindowLike } from './ManualWindow'

class FakeWindow implements ManualWindowLike {
  destroyed = false
  loadFile = vi.fn(async () => {})
  focus = vi.fn()
  show = vi.fn()
  destroy = vi.fn(() => {
    this.destroyed = true
    this.emit('closed')
  })
  private listeners: Record<string, Array<(...args: unknown[]) => void>> = {}

  on(event: string, listener: (...args: unknown[]) => void): this {
    this.listeners[event] = this.listeners[event] ?? []
    this.listeners[event].push(listener)
    return this
  }

  once(event: string, listener: (...args: unknown[]) => void): this {
    this.listeners[event] = this.listeners[event] ?? []
    this.listeners[event].push((...args: unknown[]) => {
      this.listeners[event] = []
      listener(...args)
    })
    return this
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners[event] ?? []) {
      listener(...args)
    }
  }

  isDestroyed(): boolean {
    return this.destroyed
  }
}

function makeOpener(): { opener: ReturnType<typeof createManualOpener>; create: ReturnType<typeof vi.fn>; lastWindow: () => FakeWindow } {
  const create = vi.fn(() => new FakeWindow())
  const opener = createManualOpener({ manualPath: '/app/manual.html', create })
  return {
    opener,
    create,
    lastWindow: () => create.mock.results[create.mock.results.length - 1].value as FakeWindow
  }
}

describe('createManualOpener', () => {
  it('creates a non-destroyed window and loads the manual at the section', async () => {
    const { opener, create, lastWindow } = makeOpener()

    await opener.open('section-4-3')

    expect(create).toHaveBeenCalledTimes(1)
    const win = lastWindow()
    expect(win.destroyed).toBe(false)
    expect(win.show).not.toHaveBeenCalled()
    expect(win.loadFile).toHaveBeenCalledWith('/app/manual.html', { hash: 'section-4-3' })
  })

  it('shows the window once it is ready to be displayed', async () => {
    const { opener, lastWindow } = makeOpener()

    await opener.open('section-4-3')
    lastWindow().emit('ready-to-show')

    expect(lastWindow().show).toHaveBeenCalledTimes(1)
  })

  it('reuses the existing window and focuses it on repeated opens', async () => {
    const { opener, create, lastWindow } = makeOpener()

    await opener.open('section-4-3')
    await opener.open('section-11')

    expect(create).toHaveBeenCalledTimes(1)
    const win = lastWindow()
    expect(win.loadFile).toHaveBeenCalledTimes(2)
    expect(win.loadFile).toHaveBeenLastCalledWith('/app/manual.html', { hash: 'section-11' })
    expect(win.focus).toHaveBeenCalledTimes(1)
  })

  it('creates a new window after the previous one is closed', async () => {
    const { opener, create, lastWindow } = makeOpener()

    await opener.open('section-4-3')
    opener.close()

    await opener.open('section-11')

    expect(create).toHaveBeenCalledTimes(2)
    expect(lastWindow().loadFile).toHaveBeenCalledWith('/app/manual.html', { hash: 'section-11' })
  })
})