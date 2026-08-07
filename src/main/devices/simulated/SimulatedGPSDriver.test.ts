import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { SimulatedGPSDriver } from './SimulatedGPSDriver'

async function connectWithTimers(driver: SimulatedGPSDriver): Promise<void> {
  const connectPromise = driver.connect()
  await vi.advanceTimersByTimeAsync(500)
  await connectPromise
}

describe('SimulatedGPSDriver', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports metadata for the simulated device', () => {
    const driver = new SimulatedGPSDriver({ port: 'COM5' })

    expect(driver.meta).toEqual({
      id: 'gps-sim',
      name: 'GPS Simulado',
      type: 'gps',
      port: 'COM5',
      baudRate: 4800
    })
    expect(driver.isConnected()).toBe(false)
  })

  it('connects and starts emitting positions', async () => {
    const driver = new SimulatedGPSDriver({ port: 'COM5' })
    const positionSpy = vi.fn()
    const statusSpy = vi.fn()
    driver.on('position', positionSpy)
    driver.on('status', statusSpy)

    const connectPromise = driver.connect()
    expect(driver.status).toBe('connecting')

    await vi.advanceTimersByTimeAsync(500)
    await connectPromise

    expect(driver.status).toBe('connected')
    expect(driver.isConnected()).toBe(true)
    expect(statusSpy).toHaveBeenCalledWith('connected')
    expect(positionSpy).toHaveBeenCalledTimes(1)
    expect(driver.getLastPosition()).not.toBeNull()
    expect(driver.isPositionValid()).toBe(true)
  })

  it('emits a new position every second', async () => {
    const driver = new SimulatedGPSDriver({ port: 'COM5' })
    const positionSpy = vi.fn()
    driver.on('position', positionSpy)

    await connectWithTimers(driver)
    await vi.advanceTimersByTimeAsync(1000)

    expect(positionSpy).toHaveBeenCalledTimes(2)
  })

  it('emits positions near the configured center', async () => {
    const driver = new SimulatedGPSDriver({ port: 'COM5' })
    const positionSpy = vi.fn()
    driver.on('position', positionSpy)

    await connectWithTimers(driver)

    const [pos, valid] = positionSpy.mock.calls[0]
    expect(valid).toBe(true)
    expect(pos.lat).toBeGreaterThan(-34.62)
    expect(pos.lat).toBeLessThan(-34.58)
    expect(pos.lon).toBeGreaterThan(-58.4)
    expect(pos.lon).toBeLessThan(-58.36)
    expect(driver.getState().valid).toBe(true)
  })

  it('stops emitting after disconnect', async () => {
    const driver = new SimulatedGPSDriver({ port: 'COM5' })
    const positionSpy = vi.fn()
    driver.on('position', positionSpy)

    await connectWithTimers(driver)
    await driver.disconnect()

    expect(driver.status).toBe('disconnected')
    expect(driver.isConnected()).toBe(false)
    expect(driver.isPositionValid()).toBe(false)

    positionSpy.mockClear()
    await vi.advanceTimersByTimeAsync(3000)
    expect(positionSpy).not.toHaveBeenCalled()
  })
})
