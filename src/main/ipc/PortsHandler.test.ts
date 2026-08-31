import { describe, expect, it, vi } from 'vitest'
import { IPC_HANDLERS } from '../../shared/ipc-channels'
import { registerPortsHandlers } from './PortsHandler'
import { createFakeIpc } from './ipcTestUtils'

describe('registerPortsHandlers', () => {
  it('registers a ports:list handler returning the port list', async () => {
    const { ipc, handlers } = createFakeIpc()
    const listPorts = vi.fn(async () => [
      { path: 'COM3', manufacturer: 'FTDI' },
      { path: 'COM5', manufacturer: 'NBM' }
    ])

    registerPortsHandlers(ipc, listPorts)

    const result = await handlers.get(IPC_HANDLERS.PORTS_LIST)!(undefined)
    expect(result).toEqual([
      { path: 'COM3', manufacturer: 'FTDI' },
      { path: 'COM5', manufacturer: 'NBM' }
    ])
    expect(listPorts).toHaveBeenCalledOnce()
  })

  it('rethrows a sanitized error when listing ports fails', async () => {
    const { ipc, handlers } = createFakeIpc()
    const listPorts = vi.fn(async () => {
      throw new Error('port not found')
    })

    registerPortsHandlers(ipc, listPorts)

    await expect(handlers.get(IPC_HANDLERS.PORTS_LIST)!(undefined)).rejects.toThrow(
      'Puerto serie no encontrado. Verificá la conexión del dispositivo.'
    )
  })
})
