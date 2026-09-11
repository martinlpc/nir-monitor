import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findByIds: vi.fn()
}))

vi.mock('usb', () => ({
  findByIds: mocks.findByIds
}))

import { detectGarminUsb } from './GarminUsbDetector'

interface MockGarminUsbDevice {
  open: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  interface: ReturnType<typeof vi.fn>
  iface: { claim: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }
}

function makeDevice(claim: () => void = () => undefined): MockGarminUsbDevice {
  const iface = {
    claim: vi.fn(claim),
    release: vi.fn((_closeEndpoints?: boolean, callback?: (error?: Error) => void) => {
      callback?.()
    })
  }
  return {
    open: vi.fn(),
    close: vi.fn(),
    interface: vi.fn(() => iface),
    iface
  }
}

describe('detectGarminUsb', () => {
  beforeEach(() => {
    mocks.findByIds.mockReset()
  })

  it('reports absent when no such device is connected', async () => {
    mocks.findByIds.mockReturnValue(undefined)

    expect(await detectGarminUsb()).toEqual({ present: false, accessible: false })
  })

  it('reports present and accessible when the interface can be claimed', async () => {
    const device = makeDevice()
    mocks.findByIds.mockReturnValue(device)

    expect(await detectGarminUsb()).toEqual({ present: true, accessible: true })
    expect(device.open).toHaveBeenCalledTimes(1)
    expect(device.iface.claim).toHaveBeenCalledTimes(1)
    expect(device.iface.release).toHaveBeenCalledWith(true, expect.any(Function))
    expect(device.close).toHaveBeenCalledTimes(1)
  })

  it('reports present but not accessible when claiming fails', async () => {
    const device = makeDevice(() => {
      throw new Error('LIBUSB_ERROR_ACCESS')
    })
    mocks.findByIds.mockReturnValue(device)

    expect(await detectGarminUsb()).toEqual({ present: true, accessible: false })
    expect(device.iface.claim).toHaveBeenCalledTimes(1)
    expect(device.close).toHaveBeenCalledTimes(1)
  })

  it('reports present but not accessible when close fails after a successful claim', async () => {
    const device = makeDevice()
    device.close.mockImplementation(() => {
      throw new Error('Can not close device with a pending request')
    })
    mocks.findByIds.mockReturnValue(device)

    expect(await detectGarminUsb()).toEqual({ present: true, accessible: false })
  })

  it('reports absent when the usb backend throws while enumerating', async () => {
    mocks.findByIds.mockImplementation(() => {
      throw new Error('no libusb backend')
    })

    expect(await detectGarminUsb()).toEqual({ present: false, accessible: false })
  })
})
