import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/nir-test'),
    getAppPath: vi.fn(() => '/tmp/nir-test'),
    getVersion: vi.fn(() => '0.0.0-test')
  }
}))

import { EventBus } from '../EventBus'

function createMockWindow(): any {
  const send = vi.fn()
  return {
    webContents: { send, isDestroyed: vi.fn(() => false) }
  }
}

describe('EventBus', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus()
  })

  it('send does nothing when no window is set', () => {
    expect(() => bus.send('gps:position', { coords: null, valid: false, port: 'COM1' })).not.toThrow()
  })

  it('send forwards to webContents.send', () => {
    const win = createMockWindow()
    bus.setWindow(win)

    bus.send('gps:position', { coords: null, valid: false, port: 'COM1' })

    expect(win.webContents.send).toHaveBeenCalledWith('gps:position', {
      coords: null,
      valid: false,
      port: 'COM1'
    })
  })

  it('send skips when webContents is destroyed', () => {
    const win = createMockWindow()
    win.webContents.isDestroyed.mockReturnValue(true)
    bus.setWindow(win)

    bus.send('nbm:sample', { rss: 5.0, unit: 'V/m', battery: 100, timestamp: 0 })

    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('alert sends message and type', () => {
    const win = createMockWindow()
    bus.setWindow(win)

    bus.alert('Something happened', 'warning')

    expect(win.webContents.send).toHaveBeenCalledWith('alert', {
      message: 'Something happened',
      type: 'warning',
      userAction: undefined
    })
  })

  it('getWindow returns the set window', () => {
    const win = createMockWindow()
    bus.setWindow(win)
    expect(bus.getWindow()).toBe(win)
  })

  it('getWindow returns null when no window is set', () => {
    expect(bus.getWindow()).toBeNull()
  })

  it('send with null payload works', () => {
    const win = createMockWindow()
    bus.setWindow(win)

    bus.send('gps:fix-lost', null)

    expect(win.webContents.send).toHaveBeenCalledWith('gps:fix-lost', null)
  })
})
