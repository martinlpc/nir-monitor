import { EventEmitter } from 'events'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import type { Mock } from 'vitest'
import { SessionSupervisor } from './SessionSupervisor'
import type { INBMDriver, IGPSDriver } from '../../shared/driver-interfaces'
import type { DeviceStatus } from '../../shared/device.types'

class FakeDeviceManager extends EventEmitter {
  private nbm: INBMDriver | null = null
  private gps: IGPSDriver | null = null
  sessionActiveCalls: boolean[] = []

  setDevices(nbm: INBMDriver | null, gps: IGPSDriver | null): void {
    this.nbm = nbm
    this.gps = gps
  }

  getNBM(): INBMDriver | null {
    return this.nbm
  }

  getGPS(): IGPSDriver | null {
    return this.gps
  }

  setSessionActive(active: boolean): void {
    this.sessionActiveCalls.push(active)
  }
}

class FakeSessionService extends EventEmitter {
  state: 'idle' | 'running' | 'stopped' = 'idle'
  setNbmCalls = 0
  setGpsCalls = 0
  stopSpy = vi.fn()
  alerts: string[] = []

  constructor() {
    super()
    this.on('alert', (a: { message: string }) => this.alerts.push(a.message))
  }

  getState(): string {
    return this.state
  }

  setNBM(): void {
    this.setNbmCalls++
  }

  setGPS(): void {
    this.setGpsCalls++
  }

  stop(): Promise<void> {
    this.stopSpy()
    this.state = 'stopped'
    return Promise.resolve()
  }
}

const NBM = {} as INBMDriver
const GPS = {} as IGPSDriver

describe('SessionSupervisor', () => {
  let dm: FakeDeviceManager
  let ss: FakeSessionService
  let setTimer: Mock<(fn: () => void, ms: number) => NodeJS.Timeout>
  let clearTimer: Mock<(timer: NodeJS.Timeout) => void>

  function createSupervisor(stallTimeoutMs = 30_000): SessionSupervisor {
    setTimer = vi.fn((fn: () => void, ms: number) => setTimeout(fn, ms))
    clearTimer = vi.fn((t: NodeJS.Timeout) => clearTimeout(t))
    const supervisor = new SessionSupervisor({
      deviceManager: dm as never,
      sessionService: ss as never,
      stallTimeoutMs,
      setTimer,
      clearTimer
    })
    supervisor.wire()
    return supervisor
  }

  function emitStatus(deviceId: string, status: DeviceStatus, intentional = false): void {
    dm.emit('device:status', { deviceId, status, intentional })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    dm = new FakeDeviceManager()
    ss = new FakeSessionService()
    dm.setDevices(NBM, GPS)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('wires connected drivers on wire()', () => {
    createSupervisor()
    expect(ss.setNbmCalls).toBe(1)
    expect(ss.setGpsCalls).toBe(1)
  })

  it('does not wire drivers that are not available', () => {
    dm.setDevices(null, null)
    createSupervisor()
    expect(ss.setNbmCalls).toBe(0)
    expect(ss.setGpsCalls).toBe(0)
  })

  it('syncs NBM polling with session lifecycle', () => {
    createSupervisor()
    ss.emit('started')
    ss.emit('stopped')
    expect(dm.sessionActiveCalls).toEqual([true, false])
  })

  it('arms stall watchdog when NBM disconnects during running session', () => {
    createSupervisor()
    ss.state = 'running'
    emitStatus('nbm550', 'disconnected')
    expect(setTimer).toHaveBeenCalledTimes(1)
    expect(ss.alerts).toContain(
      'NBM-550 desconectado — la sesión se detendrá automáticamente en 30s si no se reconecta'
    )
  })

  it('does not arm watchdog when NBM disconnects with idle session', () => {
    createSupervisor()
    emitStatus('nbm550', 'disconnected')
    expect(setTimer).not.toHaveBeenCalled()
  })

  it('does not arm watchdog on intentional disconnect', () => {
    createSupervisor()
    ss.state = 'running'
    emitStatus('nbm550', 'disconnected', true)
    expect(setTimer).not.toHaveBeenCalled()
  })

  it('auto-stops session when stall timeout elapses without reconnect', () => {
    createSupervisor()
    ss.state = 'running'
    emitStatus('nbm550', 'disconnected')
    vi.advanceTimersByTime(30_000)
    expect(ss.stopSpy).toHaveBeenCalledTimes(1)
    expect(ss.alerts).toContain('Sesión detenida por pérdida de comunicación con NBM-550')
  })

  it('cancels watchdog and re-wires NBM when reconnecting before timeout', () => {
    createSupervisor()
    ss.state = 'running'
    emitStatus('nbm550', 'disconnected')
    expect(ss.setNbmCalls).toBe(1)

    vi.advanceTimersByTime(10_000)
    emitStatus('nbm550', 'connected')
    vi.advanceTimersByTime(30_000)

    expect(ss.stopSpy).not.toHaveBeenCalled()
    expect(clearTimer).toHaveBeenCalledTimes(1)
    expect(ss.alerts).toContain('NBM-550 reconectado — la sesión continúa normalmente')
    expect(ss.setNbmCalls).toBe(2)
  })

  it('does not emit reconnect alert when session is not running', () => {
    createSupervisor()
    emitStatus('nbm550', 'disconnected')
    emitStatus('nbm550', 'connected')
    expect(ss.alerts).not.toContain('NBM-550 reconectado — la sesión continúa normalmente')
  })

  it('cancels watchdog on manual session stop', () => {
    createSupervisor()
    ss.state = 'running'
    emitStatus('nbm550', 'disconnected')
    expect(setTimer).toHaveBeenCalledTimes(1)

    ss.state = 'idle'
    ss.emit('stopped')
    expect(clearTimer).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(30_000)
    expect(ss.stopSpy).not.toHaveBeenCalled()
  })

  it('re-wires GPS on reconnection', () => {
    createSupervisor()
    expect(ss.setGpsCalls).toBe(1)
    emitStatus('gps', 'connected')
    expect(ss.setGpsCalls).toBe(2)
  })

  it('dispose() removes listeners and pending timer', () => {
    const supervisor = createSupervisor()
    ss.state = 'running'
    emitStatus('nbm550', 'disconnected')
    expect(setTimer).toHaveBeenCalledTimes(1)

    supervisor.dispose()
    expect(clearTimer).toHaveBeenCalledTimes(1)

    ss.emit('started')
    ss.state = 'running'
    emitStatus('nbm550', 'disconnected')
    expect(setTimer).toHaveBeenCalledTimes(1)
    expect(ss.setNbmCalls).toBe(1)
  })
})
