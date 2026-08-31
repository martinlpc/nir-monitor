import { describe, expect, it } from 'vitest'

import { SimulatedDriverFactory } from './SimulatedDriverFactory'
import { SimulatedGPSDriver } from '../devices/simulated/SimulatedGPSDriver'
import { SimulatedNBM550Driver } from '../devices/simulated/SimulatedNBM550Driver'

describe('SimulatedDriverFactory', () => {
  it('creates simulated drivers with the requested port', () => {
    const factory = new SimulatedDriverFactory()

    const gps = factory.createGPS('COM5')
    expect(gps).toBeInstanceOf(SimulatedGPSDriver)
    expect(gps.meta.port).toBe('COM5')

    const nbm = factory.createNBM('COM3')
    expect(nbm).toBeInstanceOf(SimulatedNBM550Driver)
    expect(nbm.meta.port).toBe('COM3')
  })
})
