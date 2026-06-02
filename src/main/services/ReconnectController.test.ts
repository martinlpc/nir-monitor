import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ReconnectController } from './ReconnectController'

describe('ReconnectController', () => {
  let controller: ReconnectController
  let connectFn: ReturnType<typeof vi.fn>
  let onStatus: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    connectFn = vi.fn()
    onStatus = vi.fn()
    controller = new ReconnectController({
      deviceId: 'test-device',
      intervalMs: 1000,
      timeoutMs: 5000,
      connectFn,
      onStatus
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts reconnection cycle and sets state', () => {
    controller.start('COM1')

    expect(controller.isReconnecting).toBe(true)
    expect(controller.port).toBe('COM1')
    expect(onStatus).toHaveBeenCalledWith('test-device', 'connecting')
  })

  it('calls connectFn after the interval', async () => {
    connectFn.mockResolvedValue(true)
    controller.start('COM1')

    await vi.advanceTimersByTimeAsync(1000)

    expect(connectFn).toHaveBeenCalledWith('COM1')
  })

  it('stops reconnecting when connectFn returns true', async () => {
    connectFn.mockResolvedValue(true)
    controller.start('COM1')

    await vi.advanceTimersByTimeAsync(1000)

    expect(controller.isReconnecting).toBe(false)
  })

  it('retries on failure and stops on success', async () => {
    connectFn
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(true)
    controller.start('COM1')

    await vi.advanceTimersByTimeAsync(1000)
    expect(connectFn).toHaveBeenCalledTimes(1)
    expect(controller.isReconnecting).toBe(true)

    await vi.advanceTimersByTimeAsync(1000)
    expect(connectFn).toHaveBeenCalledTimes(2)
    expect(controller.isReconnecting).toBe(false)
  })

  it('emits disconnected after timeout expires', async () => {
    connectFn.mockRejectedValue(new Error('fail'))
    controller.start('COM1')

    await vi.advanceTimersByTimeAsync(5000)

    expect(onStatus).toHaveBeenCalledWith('test-device', 'disconnected')
    expect(controller.isReconnecting).toBe(false)
  })

  it('stops mid-cycle and does not schedule further attempts', async () => {
    connectFn.mockRejectedValue(new Error('fail'))
    controller.start('COM1')

    await vi.advanceTimersByTimeAsync(1000)
    expect(connectFn).toHaveBeenCalledTimes(1)

    controller.stop()

    await vi.advanceTimersByTimeAsync(5000)

    expect(connectFn).toHaveBeenCalledTimes(1)
  })

  it('ignores duplicate start calls', () => {
    controller.start('COM1')
    controller.start('COM2')

    expect(controller.port).toBe('COM1')
    expect(controller.isReconnecting).toBe(true)
  })

  it('stop clears reconnecting flag even without active timers', () => {
    controller.stop()

    expect(controller.isReconnecting).toBe(false)
  })
})
