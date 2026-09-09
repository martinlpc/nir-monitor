import { describe, expect, it } from 'vitest'
import { RealDriverFactory } from './RealDriverFactory'
import { NBM_BAUD_RATE, NBM_OPTICAL_BAUD_RATE } from '../../shared/config.constants'

describe('RealDriverFactory', () => {
  const factory = new RealDriverFactory()

  it('createNBM uses USB baud by default', () => {
    const nbm = factory.createNBM('COM3')
    expect(nbm.meta.baudRate).toBe(NBM_BAUD_RATE)
  })

  it('createNBM uses optical baud when connectionType is optical', () => {
    const nbm = factory.createNBM('COM3', 'optical')
    expect(nbm.meta.baudRate).toBe(NBM_OPTICAL_BAUD_RATE)
  })

  it('createNBM uses USB baud when connectionType is usb', () => {
    const nbm = factory.createNBM('COM3', 'usb')
    expect(nbm.meta.baudRate).toBe(NBM_BAUD_RATE)
  })
})
