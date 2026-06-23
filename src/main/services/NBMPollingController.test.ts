import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { NBMPollingController, NBM_STANDBY_BATTERY_INTERVAL_MS } from './NBMPollingController'
import type { NBMPollingCallbacks } from './NBMPollingController'
import type { NBM550Driver } from '../devices/nbm550/NBM550Driver'
import type { NBM550Sample } from '../devices/nbm550/nbm550.types'

const defaultSample: NBM550Sample = {
  rss: 12.5,
  unit: 'V/m',
  battery: 100,
  timestamp: Date.now()
}

function createMockDriver(
  overrides: {
    isConnected?: boolean
    readBattery?: number | null
    readMeasurement?: NBM550Sample | null
  } = {}
): NBM550Driver {
  return {
    meta: { port: 'COM1' },
    isConnected: vi.fn().mockReturnValue(overrides.isConnected ?? true),
    readBattery: vi.fn().mockResolvedValue(overrides.readBattery ?? 100),
    readMeasurement: vi
      .fn()
      .mockResolvedValue(
        overrides.readMeasurement === undefined ? defaultSample : overrides.readMeasurement
      )
  } as unknown as NBM550Driver
}

describe('NBMPollingController', () => {
  let controller: NBMPollingController
  let onSample: NBMPollingCallbacks['onSample']
  let onMaxFailuresExceeded: NBMPollingCallbacks['onMaxFailuresExceeded']

  beforeEach(() => {
    vi.useRealTimers()
    onSample = vi.fn()
    onMaxFailuresExceeded = vi.fn()
    controller = new NBMPollingController(8, {
      onSample,
      onMaxFailuresExceeded
    })
  })

  afterEach(() => {
    controller.stop()
  })

  it('is not polling after construction', () => {
    expect(controller.isPolling).toBe(false)
  })

  it('starts in standby mode', () => {
    const driver = createMockDriver()
    controller.start(driver)
    expect(controller.mode).toBe('standby')
  })

  it('emits samples in active mode', async () => {
    const driver = createMockDriver()
    controller.start(driver)
    controller.setSessionActive(true)

    await vi.waitFor(() => expect(driver.readMeasurement).toHaveBeenCalled(), { timeout: 1000 })

    expect(onSample).toHaveBeenCalledWith(expect.objectContaining({ rss: 12.5, unit: 'V/m' }))
  })

  it('does not read measurement in standby mode', async () => {
    const driver = createMockDriver()
    controller.start(driver)

    await new Promise((r) => setTimeout(r, 600))

    expect(driver.readMeasurement).not.toHaveBeenCalled()
    expect(onSample).not.toHaveBeenCalled()
  })

  it('switches between standby and active', () => {
    const driver = createMockDriver()
    controller.start(driver)
    expect(controller.mode).toBe('standby')

    controller.setSessionActive(true)
    expect(controller.mode).toBe('active')

    controller.setSessionActive(false)
    expect(controller.mode).toBe('standby')
  })

  it('stops polling and clears state', () => {
    const driver = createMockDriver()
    controller.start(driver)
    expect(controller.isPolling).toBe(true)

    controller.stop()

    expect(controller.isPolling).toBe(false)
  })

  it('emits nothing when driver is disconnected', async () => {
    const driver = createMockDriver({ isConnected: false })
    controller.start(driver)

    await vi.waitFor(() => expect(controller.isPolling).toBe(false), { timeout: 1000 })
    expect(driver.readMeasurement).not.toHaveBeenCalled()
    expect(onSample).not.toHaveBeenCalled()
  })

  it('stops polling and emits error after max consecutive failures in active mode', async () => {
    const driver = createMockDriver({ readMeasurement: null })
    const failController = new NBMPollingController(3, {
      onSample,
      onMaxFailuresExceeded
    })

    failController.start(driver)
    failController.setSessionActive(true)

    await vi.waitFor(() => expect(onMaxFailuresExceeded).toHaveBeenCalled(), { timeout: 2000 })

    expect(failController.isPolling).toBe(false)
    expect(onMaxFailuresExceeded).toHaveBeenCalledWith(
      'COM1',
      expect.objectContaining({ code: 'NBM_POLL_FAILURE' })
    )
  })

  it('schedules battery reads on start using fake timers', async () => {
    vi.useFakeTimers()
    const driver = createMockDriver({ readBattery: 75 })
    const batteryController = new NBMPollingController(8, {
      onSample,
      onMaxFailuresExceeded
    })

    batteryController.start(driver)

    // Battery is read once immediately on start
    expect(driver.readBattery).toHaveBeenCalledTimes(1)

    // Then every NBM_STANDBY_BATTERY_INTERVAL_MS (30s)
    await vi.advanceTimersByTimeAsync(NBM_STANDBY_BATTERY_INTERVAL_MS)
    expect(driver.readBattery).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(NBM_STANDBY_BATTERY_INTERVAL_MS)
    expect(driver.readBattery).toHaveBeenCalledTimes(3)

    batteryController.stop()
    vi.useRealTimers()
  })

  it('does not accumulate failures in standby mode', async () => {
    const driver = createMockDriver({ readMeasurement: null })
    const failController = new NBMPollingController(3, {
      onSample,
      onMaxFailuresExceeded
    })

    failController.start(driver)
    // En standby no hay mediciones, no debería fallar
    await new Promise((r) => setTimeout(r, 600))

    expect(onMaxFailuresExceeded).not.toHaveBeenCalled()
    expect(failController.isPolling).toBe(true)

    failController.stop()
  })
})
