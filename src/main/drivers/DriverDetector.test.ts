import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listMock, accessSyncMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  accessSyncMock: vi.fn()
}))

vi.mock('serialport', () => ({
  SerialPort: { list: listMock }
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, accessSync: accessSyncMock }
})

import { DriverDetector } from './DriverDetector'

function port(vendorId: string | undefined, path = 'COM3'): Record<string, unknown> {
  return { path, vendorId, productId: '6001', manufacturer: 'ACME', friendlyName: `USB (${path})` }
}

describe('DriverDetector', () => {
  beforeEach(() => {
    listMock.mockReset()
    accessSyncMock.mockReset()
  })

  it.each([
    ['0403', 'ftdi'],
    ['067b', 'prolific'],
    ['067B', 'prolific'],
    ['1a86', 'ch340'],
    ['1A86', 'ch340'],
    ['10c4', 'cp210x'],
    ['10C4', 'cp210x'],
    ['0x067b', 'prolific'],
    ['0X1A86', 'ch340']
  ])('maps vendor id %s to %s', async (vendorId, expected) => {
    listMock.mockResolvedValueOnce([port(vendorId)])

    const result = await new DriverDetector().check()

    expect(result.ports[0].driverType).toBe(expected)
    expect(result.ports[0].installed).toBe(true)
    expect(result.missing).toEqual([])
  })

  it('reports unknown vendors as unknown and never as missing', async () => {
    listMock.mockResolvedValueOnce([port('ABCD'), port(undefined, 'COM4')])
    accessSyncMock.mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const result = await new DriverDetector().check()

    expect(result.ports.map((p) => p.driverType)).toEqual(['unknown', 'unknown'])
    expect(result.ports.every((p) => p.installed)).toBe(true)
    expect(result.missing).toEqual([])
  })

  it('lists a known device as missing when its driver file is absent', async () => {
    listMock.mockResolvedValueOnce([port('067b', 'COM5')])
    accessSyncMock.mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const result = await new DriverDetector().check()

    expect(result.ports[0]).toMatchObject({
      path: 'COM5',
      driverType: 'prolific',
      installed: false
    })
    expect(result.missing).toHaveLength(1)
    expect(result.missing[0].path).toBe('COM5')
  })

  it('falls back to the port path when there is no friendly name', async () => {
    listMock.mockResolvedValueOnce([{ path: 'COM7', vendorId: '0403' }])

    const result = await new DriverDetector().check()

    expect(result.ports[0]).toMatchObject({
      friendlyName: 'COM7',
      manufacturer: null,
      vendorId: '0403',
      productId: null
    })
  })
})
