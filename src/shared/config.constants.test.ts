import { describe, expect, it } from 'vitest'
import {
  NBM_BAUD_RATE,
  GPS_BAUD_RATE,
  DEFAULT_NBM_POLLING,
  DEFAULT_NBM_RECONNECT,
  DEFAULT_GPS_RECONNECT,
  DEFAULT_GEO_FUSION,
  DEFAULT_SERIAL_PROBE,
  DEFAULT_FLUSH,
  DEFAULT_NBM_DRIVER
} from './config.constants'

describe('config constants', () => {
  it('has correct baud rates', () => {
    expect(NBM_BAUD_RATE).toBe(460800)
    expect(GPS_BAUD_RATE).toBe(4800)
  })

  it('has correct default NBM polling config', () => {
    expect(DEFAULT_NBM_POLLING.activePollIntervalMs).toBe(200)
    expect(DEFAULT_NBM_POLLING.standbyBatteryIntervalMs).toBe(30000)
    expect(DEFAULT_NBM_POLLING.maxConsecutiveReadFailures).toBe(8)
  })

  it('has correct default reconnect config', () => {
    expect(DEFAULT_NBM_RECONNECT.intervalMs).toBe(3000)
    expect(DEFAULT_NBM_RECONNECT.timeoutMs).toBe(30000)
    expect(DEFAULT_GPS_RECONNECT.intervalMs).toBe(3000)
    expect(DEFAULT_GPS_RECONNECT.timeoutMs).toBe(30000)
  })

  it('has correct default geo fusion config', () => {
    expect(DEFAULT_GEO_FUSION.triggerMode).toBe('distance')
    expect(DEFAULT_GEO_FUSION.minDistanceMeters).toBe(20)
    expect(DEFAULT_GEO_FUSION.intervalMs).toBe(5000)
    expect(DEFAULT_GEO_FUSION.testMode).toBe(false)
  })

  it('has correct default serial probe config', () => {
    expect(DEFAULT_SERIAL_PROBE.nbmTimeoutMs).toBe(6000)
    expect(DEFAULT_SERIAL_PROBE.nmeaListenMs).toBe(12000)
  })

  it('has correct default flush config', () => {
    expect(DEFAULT_FLUSH.everyNPoints).toBe(5)
    expect(DEFAULT_FLUSH.intervalMs).toBe(5000)
  })

  it('has correct default NBM driver config', () => {
    expect(DEFAULT_NBM_DRIVER.baudRate).toBe(460800)
    expect(DEFAULT_NBM_DRIVER.pollIntervalMs).toBe(200)
    expect(DEFAULT_NBM_DRIVER.unit).toBe('V/m')
  })
})
