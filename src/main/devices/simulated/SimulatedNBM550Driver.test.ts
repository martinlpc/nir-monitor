import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { SimulatedNBM550Driver } from './SimulatedNBM550Driver'

async function connectWithTimers(driver: SimulatedNBM550Driver): Promise<void> {
  const connectPromise = driver.connect()
  await vi.advanceTimersByTimeAsync(500)
  await connectPromise
}

describe('SimulatedNBM550Driver', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports metadata for the simulated device', () => {
    const driver = new SimulatedNBM550Driver({ port: 'COM3' })

    expect(driver.meta).toEqual({
      id: 'nbm-sim',
      name: 'NBM-550 Simulado',
      type: 'emf',
      port: 'COM3',
      baudRate: 460800
    })
    expect(driver.isConnected()).toBe(false)
  })

  it('returns null measurements while disconnected', async () => {
    const driver = new SimulatedNBM550Driver({ port: 'COM3' })

    expect(await driver.readMeasurement()).toBeNull()
    expect(await driver.readBattery()).toBeNull()
  })

  it('connects and returns bounded samples', async () => {
    const driver = new SimulatedNBM550Driver({ port: 'COM3' })
    const statusSpy = vi.fn()
    driver.on('status', statusSpy)

    const connectPromise = driver.connect()
    expect(driver.status).toBe('connecting')

    await vi.advanceTimersByTimeAsync(500)
    await connectPromise

    expect(driver.status).toBe('connected')
    expect(driver.isConnected()).toBe(true)
    expect(statusSpy).toHaveBeenCalledWith('connected')

    const sample = await driver.readMeasurement()
    expect(sample).not.toBeNull()
    expect(sample?.unit).toBe('V/m')
    expect(sample?.rss).toBeGreaterThanOrEqual(0.8)
    expect(sample?.rss).toBeLessThanOrEqual(30)
    expect(sample?.battery).toBe(100)
    expect(typeof sample?.timestamp).toBe('number')
  })

  it('decreases battery over time', async () => {
    const driver = new SimulatedNBM550Driver({ port: 'COM3' })
    await connectWithTimers(driver)

    const full = await driver.readBattery()
    expect(full).toBe(100)

    await vi.advanceTimersByTimeAsync(130000)
    const drained = await driver.readBattery()
    expect(drained).toBe(99)
  })

  it('exposes meter and probe info', () => {
    const driver = new SimulatedNBM550Driver({ port: 'COM3' })

    expect(driver.getMeterSerial()).toBe('SIM-METER-001')
    expect(driver.getProbeInfo()).toMatchObject({ model: 'EF-0391', serial: 'SIM-0001' })
    expect(driver.getDeviceInfo()).toMatchObject({
      productName: 'NBM-550',
      firmwareVersion: '2.1.0'
    })
  })

  it('supports resetMaxHold without throwing', async () => {
    const driver = new SimulatedNBM550Driver({ port: 'COM3' })
    await expect(driver.resetMaxHold()).resolves.toBeUndefined()
  })

  it('returns null measurements after disconnect', async () => {
    const driver = new SimulatedNBM550Driver({ port: 'COM3' })
    await connectWithTimers(driver)
    await driver.disconnect()

    expect(driver.status).toBe('disconnected')
    expect(driver.isConnected()).toBe(false)
    expect(await driver.readMeasurement()).toBeNull()
  })
})
