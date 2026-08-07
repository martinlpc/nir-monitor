import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { BrowserWindow } from 'electron'

import type { AlertLogger } from '../../infrastructure/AlertLogger'
import { EventBus } from '../EventBus'

interface MockWindow {
  webContents: {
    send: ReturnType<typeof vi.fn>
    isDestroyed: ReturnType<typeof vi.fn<() => boolean>>
  }
}

function createMockWindow(): MockWindow {
  const send = vi.fn()
  return {
    webContents: { send, isDestroyed: vi.fn(() => false) }
  }
}

function setMockWindow(bus: EventBus, win: MockWindow): void {
  bus.setWindow(win as unknown as BrowserWindow)
}

function createFakeAlertLogger(): AlertLogger {
  return { log: vi.fn() } as unknown as AlertLogger
}

describe('EventBus', () => {
  let bus: EventBus
  let alertLogger: AlertLogger

  beforeEach(() => {
    alertLogger = createFakeAlertLogger()
    bus = new EventBus(alertLogger)
  })

  it('send does nothing when no window is set', () => {
    expect(() =>
      bus.send('gps:position', { coords: null, valid: false, port: 'COM1' })
    ).not.toThrow()
  })

  it('send forwards to webContents.send', () => {
    const win = createMockWindow()
    setMockWindow(bus, win)

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
    setMockWindow(bus, win)

    bus.send('nbm:sample', { rss: 5.0, unit: 'V/m', battery: 100, timestamp: 0 })

    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('alert sends message and type and logs it', () => {
    const win = createMockWindow()
    setMockWindow(bus, win)

    bus.alert('Something happened', 'warning')

    expect(win.webContents.send).toHaveBeenCalledWith('alert', {
      message: 'Something happened',
      type: 'warning',
      userAction: undefined
    })
    expect(alertLogger.log).toHaveBeenCalledWith('Something happened', 'warning')
  })

  it('alert logs a suggested action when userAction is provided', () => {
    bus.alert('Error al exportar', 'error', 'Verificá la ruta de destino')

    expect(alertLogger.log).toHaveBeenCalledWith('Error al exportar', 'error')
    expect(alertLogger.log).toHaveBeenCalledWith(
      '[Acción sugerida] Verificá la ruta de destino',
      'error'
    )
  })

  it('getWindow returns the set window', () => {
    const win = createMockWindow()
    setMockWindow(bus, win)
    expect(bus.getWindow()).toBe(win)
  })

  it('getWindow returns null when no window is set', () => {
    expect(bus.getWindow()).toBeNull()
  })

  it('send with null payload works', () => {
    const win = createMockWindow()
    setMockWindow(bus, win)

    bus.send('gps:fix-lost', null)

    expect(win.webContents.send).toHaveBeenCalledWith('gps:fix-lost', null)
  })
})
