import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { NBMPollingController } from './NBMPollingController'
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

  it('starts polling and emits samples', async () => {
    const driver = createMockDriver()
    controller.start(driver)

    await vi.waitFor(() => expect(driver.readMeasurement).toHaveBeenCalled(), { timeout: 1000 })

    expect(onSample).toHaveBeenCalledWith(expect.objectContaining({ rss: 12.5, unit: 'V/m' }))
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

  it('stops polling and emits error after max consecutive failures', async () => {
    const driver = createMockDriver({ readMeasurement: null })
    const failController = new NBMPollingController(3, {
      onSample,
      onMaxFailuresExceeded
    })

    failController.start(driver)

    await vi.waitFor(() => expect(onMaxFailuresExceeded).toHaveBeenCalled(), { timeout: 2000 })

    expect(failController.isPolling).toBe(false)
    expect(onMaxFailuresExceeded).toHaveBeenCalledWith(
      'COM1',
      expect.objectContaining({ code: 'NBM_POLL_FAILURE' })
    )
  })

  it('reads battery every 5 samples', async () => {
    const driver = createMockDriver({ readBattery: 75 })
    controller.start(driver)

    await vi.waitFor(
      () => {
        expect(driver.readBattery).toHaveBeenCalled()
      },
      { timeout: 3000 }
    )
  })
})
