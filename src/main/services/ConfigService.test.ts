import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ConfigService } from './ConfigService'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('ConfigService', () => {
  // ── Static defaults ───────────────────────────────────

  it('has correct baud rates', () => {
    expect(ConfigService.NBM_BAUD_RATE).toBe(460800)
    expect(ConfigService.GPS_BAUD_RATE).toBe(4800)
  })

  it('has correct default NBM polling config', () => {
    const cfg = ConfigService.DEFAULT_NBM_POLLING
    expect(cfg.activePollIntervalMs).toBe(200)
    expect(cfg.standbyBatteryIntervalMs).toBe(30000)
    expect(cfg.maxConsecutiveReadFailures).toBe(8)
  })

  it('has correct default reconnect config', () => {
    expect(ConfigService.DEFAULT_NBM_RECONNECT.intervalMs).toBe(3000)
    expect(ConfigService.DEFAULT_NBM_RECONNECT.timeoutMs).toBe(30000)
    expect(ConfigService.DEFAULT_GPS_RECONNECT.intervalMs).toBe(3000)
    expect(ConfigService.DEFAULT_GPS_RECONNECT.timeoutMs).toBe(30000)
  })

  it('has correct default geo fusion config', () => {
    const cfg = ConfigService.DEFAULT_GEO_FUSION
    expect(cfg.triggerMode).toBe('distance')
    expect(cfg.minDistanceMeters).toBe(20)
    expect(cfg.intervalMs).toBe(5000)
    expect(cfg.testMode).toBe(false)
  })

  it('has correct default serial probe config', () => {
    const cfg = ConfigService.DEFAULT_SERIAL_PROBE
    expect(cfg.nbmTimeoutMs).toBe(6000)
    expect(cfg.nmeaListenMs).toBe(12000)
  })

  it('has correct default flush config', () => {
    const cfg = ConfigService.DEFAULT_FLUSH
    expect(cfg.everyNPoints).toBe(5)
    expect(cfg.intervalMs).toBe(5000)
  })

  it('has correct default NBM driver config', () => {
    const cfg = ConfigService.DEFAULT_NBM_DRIVER
    expect(cfg.baudRate).toBe(460800)
    expect(cfg.pollIntervalMs).toBe(200)
    expect(cfg.unit).toBe('V/m')
  })

  // ── simulationMode ────────────────────────────────────

  it('detects simulation mode from env var', () => {
    vi.stubEnv('NIR_SIMULATION', 'true')
    const cfg = new ConfigService()
    expect(cfg.simulationMode).toBe(true)
    vi.unstubAllEnvs()
  })

  it('detects simulation mode from argv', () => {
    vi.stubGlobal('process', { ...process, argv: [...process.argv, '--simulation'] })
    const cfg = new ConfigService()
    expect(cfg.simulationMode).toBe(true)
    vi.unstubAllGlobals()
  })

  it('defaults simulation mode to false', () => {
    vi.stubEnv('NIR_SIMULATION', 'false')
    const cfg = new ConfigService()
    expect(cfg.simulationMode).toBe(false)
    vi.unstubAllEnvs()
  })

  // ── debugMode ─────────────────────────────────────────

  it('detects debug mode from env var', () => {
    vi.stubEnv('NIR_APP_MODE', 'debug')
    const cfg = new ConfigService()
    expect(cfg.debugMode).toBe(true)
    vi.unstubAllEnvs()
  })

  it('defaults debug mode to false', () => {
    vi.stubEnv('NIR_APP_MODE', 'production')
    const cfg = new ConfigService()
    expect(cfg.debugMode).toBe(false)
    vi.unstubAllEnvs()
  })

  // ── nbmPollIntervalMs ─────────────────────────────────

  it('returns 200ms poll interval in real mode', () => {
    vi.stubEnv('NIR_SIMULATION', 'false')
    const cfg = new ConfigService()
    expect(cfg.nbmPollIntervalMs).toBe(200)
    vi.unstubAllEnvs()
  })

  it('returns 5000ms poll interval in simulation mode', () => {
    vi.stubEnv('NIR_SIMULATION', 'true')
    const cfg = new ConfigService()
    expect(cfg.nbmPollIntervalMs).toBe(5000)
    vi.unstubAllEnvs()
  })

  // ── Getters return clones (immutability) ──────────────

  it('nbmDriverConfig returns a copy', () => {
    const cfg = new ConfigService()
    const a = cfg.nbmDriverConfig
    const b = cfg.nbmDriverConfig
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })

  it('nbmPollingConfig returns a copy', () => {
    const cfg = new ConfigService()
    expect(cfg.nbmPollingConfig).not.toBe(ConfigService.DEFAULT_NBM_POLLING)
  })

  // ── App config with real files ────────────────────────

  describe('with real temp files', () => {
    let tmpDir: string
    let cfg: ConfigService

    beforeEach(() => {
      tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nir-config-test-')))
      cfg = new ConfigService({
        appConfigPath: path.join(tmpDir, 'app-config.json'),
        portConfigPath: path.join(tmpDir, 'port-config.json')
      })
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('loadAppConfig returns empty object when file does not exist', () => {
      const result = cfg.loadAppConfig()
      expect(result).toEqual({})
    })

    it('saveAppConfig persists and loadAppConfig retrieves', () => {
      cfg.saveAppConfig({ triggerMode: 'time', intervalMs: 3000 })
      const loaded = cfg.loadAppConfig()
      expect(loaded.triggerMode).toBe('time')
      expect(loaded.intervalMs).toBe(3000)
    })

    it('updateAppConfig merges partial values', () => {
      cfg.saveAppConfig({ triggerMode: 'distance', minDistanceMeters: 50 })
      cfg.updateAppConfig({ triggerMode: 'time' })
      const loaded = cfg.loadAppConfig()
      expect(loaded.triggerMode).toBe('time')
      expect(loaded.minDistanceMeters).toBe(50)
    })

    it('saveAppConfig overwrites existing file', () => {
      cfg.saveAppConfig({ triggerMode: 'time' })
      cfg.saveAppConfig({ triggerMode: 'distance', minDistanceMeters: 10 })
      const loaded = cfg.loadAppConfig()
      expect(loaded.triggerMode).toBe('distance')
      expect(loaded.minDistanceMeters).toBe(10)
      expect(loaded.intervalMs).toBeUndefined()
    })

    it('loadAppConfig caches result and avoids re-read', () => {
      // El cache está vacío; primera lectura crea archivo vacío
      const first = cfg.loadAppConfig()
      expect(first).toEqual({})

      // Modificar archivo por fuera
      fs.writeFileSync(
        path.join(tmpDir, 'app-config.json'),
        JSON.stringify({ triggerMode: 'time' }),
        'utf-8'
      )

      // El cache debería devolver el viejo valor
      const second = cfg.loadAppConfig()
      expect(second).toEqual({})
    })

    it('loadPortConfig returns empty object when file does not exist', () => {
      expect(cfg.loadPortConfig()).toEqual({})
    })

    it('savePortConfig persists and loadPortConfig retrieves', () => {
      cfg.savePortConfig({ nbm550: 'COM3', gps: 'COM5' })
      const loaded = cfg.loadPortConfig()
      expect(loaded.nbm550).toBe('COM3')
      expect(loaded.gps).toBe('COM5')
    })

    it('savePortConfig handles partial config', () => {
      cfg.savePortConfig({ nbm550: 'COM7' })
      const loaded = cfg.loadPortConfig()
      expect(loaded.nbm550).toBe('COM7')
      expect(loaded.gps).toBeUndefined()
    })
  })
})
