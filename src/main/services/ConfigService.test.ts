import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ConfigService } from './ConfigService'
import { DEFAULT_NBM_POLLING } from '../../shared/config.constants'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('ConfigService', () => {
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
    expect(cfg.nbmPollingConfig).not.toBe(DEFAULT_NBM_POLLING)
  })

  it('gpsDriverConfig returns a copy', () => {
    const cfg = new ConfigService()
    const a = cfg.gpsDriverConfig
    const b = cfg.gpsDriverConfig
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })

  it('nbmTimeouts returns a copy', () => {
    const cfg = new ConfigService()
    const a = cfg.nbmTimeouts
    const b = cfg.nbmTimeouts
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })

  it('serialProbeConfig returns a copy', () => {
    const cfg = new ConfigService()
    const a = cfg.serialProbeConfig
    const b = cfg.serialProbeConfig
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })

  it('geoFusionConfig returns a copy', () => {
    const cfg = new ConfigService()
    const a = cfg.geoFusionConfig
    const b = cfg.geoFusionConfig
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
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

    it('loadAppConfig parses valid JSON from file', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'app-config.json'),
        JSON.stringify({ triggerMode: 'time', intervalMs: 2500 }),
        'utf-8'
      )
      const loaded = cfg.loadAppConfig()
      expect(loaded.triggerMode).toBe('time')
      expect(loaded.intervalMs).toBe(2500)
    })

    it('loadAppConfig returns empty object on malformed JSON', () => {
      fs.writeFileSync(path.join(tmpDir, 'app-config.json'), '{not valid json', 'utf-8')
      const loaded = cfg.loadAppConfig()
      expect(loaded).toEqual({})
    })

    it('saveAppConfig catches write errors', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const broken = new ConfigService({
        appConfigPath: tmpDir,
        portConfigPath: path.join(tmpDir, 'port-config.json')
      })
      expect(() => broken.saveAppConfig({ triggerMode: 'time' })).not.toThrow()
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('loadPortConfig returns empty object on malformed JSON', () => {
      fs.writeFileSync(path.join(tmpDir, 'port-config.json'), '{not valid json', 'utf-8')
      const loaded = cfg.loadPortConfig()
      expect(loaded).toEqual({})
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
