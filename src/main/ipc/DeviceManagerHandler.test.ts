import { describe, expect, it, vi } from 'vitest'
import { IPC_HANDLERS } from '../../shared/ipc-channels'
import { registerDeviceManagerHandlers } from './DeviceManagerHandler'
import type { DeviceManagerHandlerDeps } from './DeviceManagerHandler'
import type { DeviceManagerState } from '../services/DeviceManager'
import { createFakeIpc } from './ipcTestUtils'

const STATE: DeviceManagerState = {
  nbm550: { id: null, port: 'COM3', status: 'disconnected', reconnecting: false },
  gps: { id: null, port: 'COM1', status: 'disconnected', reconnecting: false },
  scanning: false
}

function makeDeps(overrides: Partial<DeviceManagerHandlerDeps> = {}): DeviceManagerHandlerDeps {
  return {
    getState: vi.fn(() => STATE),
    scan: vi.fn(async () => STATE),
    setPortManual: vi.fn(async () => {}),
    connectDevice: vi.fn(async () => {}),
    disconnectDevice: vi.fn(async () => {}),
    ...overrides
  }
}

describe('registerDeviceManagerHandlers', () => {
  it('registers device:list returning the current state', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerDeviceManagerHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.DEVICE_LIST)!(undefined)
    expect(result).toBe(STATE)
    expect(deps.getState).toHaveBeenCalledOnce()
  })

  it('registers device:scan forwarding the scan result', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerDeviceManagerHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.DEVICE_SCAN)!(undefined)
    expect(result).toBe(STATE)
    expect(deps.scan).toHaveBeenCalledOnce()
  })

  it('registers device:set-port and returns the updated state', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerDeviceManagerHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.DEVICE_SET_PORT)!(undefined, 'gps', 'COM2')
    expect(deps.setPortManual).toHaveBeenCalledWith('gps', 'COM2')
    expect(result).toBe(STATE)
  })

  it('registers device:connect and returns the updated state', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerDeviceManagerHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.DEVICE_CONNECT)!(undefined, 'nbm550')
    expect(deps.connectDevice).toHaveBeenCalledWith('nbm550')
    expect(result).toBe(STATE)
  })

  it('registers device:disconnect and returns the updated state', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerDeviceManagerHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.DEVICE_DISCONNECT)!(undefined, 'gps')
    expect(deps.disconnectDevice).toHaveBeenCalledWith('gps')
    expect(result).toBe(STATE)
  })

  it('rethrows a sanitized error when an operation fails', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps({
      connectDevice: vi.fn(async () => {
        throw new Error('port not found')
      })
    })

    registerDeviceManagerHandlers(ipc, deps)

    await expect(handlers.get(IPC_HANDLERS.DEVICE_CONNECT)!(undefined, 'gps')).rejects.toThrow(
      'Puerto serie no encontrado. Verificá la conexión del dispositivo.'
    )
  })
})
