import { describe, expect, it, vi } from 'vitest'
import { IPC_HANDLERS } from './channels'
import { registerDriverHandlers } from './DriverHandler'
import type { DriverHandlerDeps } from './DriverHandler'
import type { DriverCheckResult } from '../../shared/driver.types'
import { createFakeIpc } from './ipcTestUtils'

function makeDeps(): DriverHandlerDeps {
  return {
    checkDrivers: vi.fn(async () => ({ ports: [], missing: [] }) as DriverCheckResult),
    installDriver: vi.fn(async () => {})
  }
}

describe('registerDriverHandlers', () => {
  it('registers drivers:check returning the detector result', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerDriverHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.DRIVERS_CHECK)!(undefined)
    expect(result).toEqual({ ports: [], missing: [] })
    expect(deps.checkDrivers).toHaveBeenCalledOnce()
  })

  it('registers drivers:install forwarding the driver type', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerDriverHandlers(ipc, deps)

    await handlers.get(IPC_HANDLERS.DRIVERS_INSTALL)!(undefined, 'ftdi')
    expect(deps.installDriver).toHaveBeenCalledWith('ftdi')
  })

  it('rethrows a sanitized error when check fails', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()
    vi.mocked(deps.checkDrivers).mockRejectedValueOnce(new Error('port not found'))

    registerDriverHandlers(ipc, deps)

    await expect(handlers.get(IPC_HANDLERS.DRIVERS_CHECK)!(undefined)).rejects.toThrow(
      'Puerto serie no encontrado. Verificá la conexión del dispositivo.'
    )
  })
})
