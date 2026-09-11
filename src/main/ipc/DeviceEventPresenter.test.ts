import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import { DeviceEventPresenter } from './DeviceEventPresenter'
import type { DeviceEventSourceLike, GpsPositionEvent } from './DeviceEventPresenter'
import type { EventSink } from './ipcEnv'
import type { DeviceManagerState } from '../services/DeviceManager'
import type { INBMDriver } from '../../shared/driver-interfaces'

const STATE: DeviceManagerState = {
  nbm550: { id: null, port: 'COM3', status: 'disconnected', reconnecting: false },
  gps: {
    id: null,
    port: 'COM1',
    status: 'disconnected',
    reconnecting: false,
    garminWinusbMissing: false
  },
  scanning: false
}

function makeSink(): EventSink {
  return {
    send: vi.fn(),
    getWindow: vi.fn(() => null),
    alert: vi.fn()
  }
}

interface SourceHarness {
  emitter: EventEmitter
  source: DeviceEventSourceLike
  nbm: { getProbeInfo: ReturnType<typeof vi.fn>; getDeviceInfo: ReturnType<typeof vi.fn> }
  sink: EventSink
}

function makeSource(): SourceHarness {
  const emitter = new EventEmitter()
  const nbm = {
    getProbeInfo: vi.fn(() => null),
    getDeviceInfo: vi.fn(() => null)
  }
  const source: DeviceEventSourceLike = {
    on: (event, listener) => emitter.on(event, listener),
    getNBM: vi.fn((): INBMDriver | null => nbm as unknown as INBMDriver),
    getState: vi.fn(() => STATE)
  }
  const sink = makeSink()
  return { emitter, source, nbm, sink }
}

function position(valid: boolean): GpsPositionEvent {
  return { coords: valid ? { lat: -38.9, lon: -68.1, alt: 300 } : null, valid, port: 'COM1' }
}

describe('DeviceEventPresenter', () => {
  it('forwards gps:nmea lines', () => {
    const { emitter, source, sink } = makeSource()
    new DeviceEventPresenter(sink).bind(source)

    emitter.emit('gps:nmea', { line: '$GPRMC,...', port: 'COM1' })

    expect(sink.send).toHaveBeenCalledWith('gps:nmea', { line: '$GPRMC,...', port: 'COM1' })
  })

  it('alerts GPS con fix only on the transition to valid', () => {
    const { emitter, source, sink } = makeSource()
    new DeviceEventPresenter(sink).bind(source)

    emitter.emit('gps:position', position(false))
    emitter.emit('gps:position', position(true))
    emitter.emit('gps:position', position(true))
    emitter.emit('gps:position', position(false))
    emitter.emit('gps:position', position(true))

    expect(sink.send).toHaveBeenNthCalledWith(2, 'gps:position', position(true))
    expect(sink.alert).toHaveBeenCalledWith('GPS con fix', 'info')
    expect(sink.alert).toHaveBeenCalledTimes(2)
  })

  it('alerts and pushes on gps:fix-lost', () => {
    const { emitter, source, sink } = makeSource()
    new DeviceEventPresenter(sink).bind(source)

    emitter.emit('gps:fix-lost')

    expect(sink.send).toHaveBeenCalledWith('gps:fix-lost', null)
    expect(sink.alert).toHaveBeenCalledWith('Se perdió la señal GPS', 'warning')
  })

  it('forwards nbm samples, battery and mode', () => {
    const { emitter, source, sink } = makeSource()
    new DeviceEventPresenter(sink).bind(source)

    emitter.emit('nbm:sample', { rss: 8.2, unit: 'V/m', battery: 90, timestamp: 1 })
    emitter.emit('nbm:battery', 90)
    emitter.emit('nbm:mode', 'active')

    expect(sink.send).toHaveBeenCalledWith('nbm:sample', {
      rss: 8.2,
      unit: 'V/m',
      battery: 90,
      timestamp: 1
    })
    expect(sink.send).toHaveBeenCalledWith('nbm:battery', 90)
    expect(sink.send).toHaveBeenCalledWith('nbm:mode', 'active')
  })

  it('alerts first GPS connection and then reconnection', () => {
    const { emitter, source, sink } = makeSource()
    new DeviceEventPresenter(sink).bind(source)

    emitter.emit('device:status', { deviceId: 'gps', status: 'connected' })
    emitter.emit('device:status', { deviceId: 'gps', status: 'disconnected', intentional: true })
    emitter.emit('device:status', { deviceId: 'gps', status: 'connected' })

    expect(sink.alert).toHaveBeenNthCalledWith(1, 'GPS conectado', 'info')
    expect(sink.alert).toHaveBeenNthCalledWith(2, 'GPS reconectado', 'info')
    expect(sink.send).toHaveBeenCalledWith('device:status', {
      deviceId: 'gps',
      status: 'connected'
    })
  })

  it('alerts a disconnected device that is not reconnecting', () => {
    const { emitter, source, sink } = makeSource()
    new DeviceEventPresenter(sink).bind(source)

    emitter.emit('device:status', { deviceId: 'nbm550', status: 'disconnected' })

    expect(sink.alert).toHaveBeenCalledWith('NBM-550 desconectado', 'warning')
  })

  it('alerts a reconnection failure after a connecting cycle', () => {
    const { emitter, source, sink } = makeSource()
    new DeviceEventPresenter(sink).bind(source)

    emitter.emit('device:status', { deviceId: 'gps', status: 'connecting' })
    emitter.emit('device:status', { deviceId: 'gps', status: 'disconnected' })

    expect(sink.alert).toHaveBeenCalledWith(
      'GPS — no se pudo reconectar',
      'error',
      'Verifique el cable USB y que el dispositivo esté encendido'
    )
  })

  it('skips alerts for intentional disconnects', () => {
    const { emitter, source, sink } = makeSource()
    new DeviceEventPresenter(sink).bind(source)

    emitter.emit('device:status', { deviceId: 'nbm550', status: 'disconnected', intentional: true })

    expect(sink.alert).not.toHaveBeenCalled()
  })

  it('alerts an expired probe calibration once per serial', () => {
    const { emitter, source, sink, nbm } = makeSource()
    nbm.getProbeInfo.mockReturnValue({
      model: 'EF-0391',
      serial: 'SN-1',
      calibrationDate: '2020-01-01'
    })
    const checkCalibration = vi.fn(() => ({
      status: 'expired' as const,
      daysUntilExpiry: -100,
      message: 'vencida'
    }))
    new DeviceEventPresenter(sink, checkCalibration).bind(source)

    emitter.emit('device:status', { deviceId: 'nbm550', status: 'connected' })
    emitter.emit('device:status', { deviceId: 'nbm550', status: 'disconnected', intentional: true })
    emitter.emit('device:status', { deviceId: 'nbm550', status: 'connected' })

    expect(sink.alert).toHaveBeenCalledWith(
      'Sonda: calibración vencida — EF-0391',
      'error',
      'Consulte con su superior antes de comenzar la sesión de mediciones'
    )
    expect(sink.alert).toHaveBeenCalledTimes(3)
  })

  it('alerts an expiring meter calibration with the message as userAction', () => {
    const { emitter, source, sink, nbm } = makeSource()
    nbm.getDeviceInfo.mockReturnValue({
      serialNumber: 'M-1',
      calDate: '2026-08-01',
      model: 'NBM-550'
    })
    const checkCalibration = vi.fn(() => ({
      status: 'expiring' as const,
      daysUntilExpiry: 10,
      message: 'vence en 10 días'
    }))
    new DeviceEventPresenter(sink, checkCalibration).bind(source)

    emitter.emit('device:status', { deviceId: 'nbm550', status: 'connected' })

    expect(sink.alert).toHaveBeenCalledWith(
      'Instrumento: calibración próxima a vencer',
      'warning',
      'vence en 10 días'
    )
  })

  it('does not alert calibration when there is no nbm driver', () => {
    const { emitter, source, sink } = makeSource()
    vi.mocked(source.getNBM).mockReturnValue(null)
    new DeviceEventPresenter(sink).bind(source)

    emitter.emit('device:status', { deviceId: 'nbm550', status: 'connected' })

    expect(sink.alert).toHaveBeenCalledWith('NBM-550 conectado', 'info')
    expect(sink.alert).toHaveBeenCalledTimes(1)
  })

  it('pushes and alerts device errors with user action', () => {
    const { emitter, source, sink } = makeSource()
    new DeviceEventPresenter(sink).bind(source)

    emitter.emit('device:error', {
      deviceId: 'nbm550',
      error: { message: 'Puerto ocupado', userAction: 'Revise el cable' }
    })

    expect(sink.send).toHaveBeenCalledWith('device:error', {
      deviceId: 'nbm550',
      error: { message: 'Puerto ocupado', userAction: 'Revise el cable' }
    })
    expect(sink.alert).toHaveBeenCalledWith('[nbm550] Puerto ocupado', 'error', 'Revise el cable')
  })

  it('pushes state and scanning snapshots', () => {
    const { emitter, source, sink } = makeSource()
    const presenter = new DeviceEventPresenter(sink)
    presenter.bind(source)
    const mergedState = { ...STATE, scanning: true }

    emitter.emit('state', STATE)
    emitter.emit('scanning', true)

    expect(sink.send).toHaveBeenCalledWith('scan:state', STATE)
    expect(sink.send).toHaveBeenCalledWith('scan:state', mergedState)
    expect(source.getState).toHaveBeenCalled()
  })
})
