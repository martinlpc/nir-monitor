import { describe, expect, it, vi } from 'vitest'
import { join } from 'path'
import { IPC_HANDLERS } from '../../shared/ipc-channels'
import { matchProbeRecord, registerSettingsHandlers } from './SettingsHandler'
import type { SettingsHandlerDeps } from './SettingsHandler'
import type { INBMDriver } from '../../shared/driver-interfaces'
import type { ProbeRecord } from '../uncertainty/loadBuiltInData'
import { createFakeIpc } from './ipcTestUtils'

const PROBE_RECORDS: ProbeRecord[] = [
  { name: 'EF-4000', fMin: 0, fMax: 100, uncertainty: 0.1, factor: 1.25 },
  { name: 'EF-4000 T', fMin: 0, fMax: 100, uncertainty: 0.1, factor: 1.3 }
]

function makeFakeNbm(
  overrides: Partial<Pick<INBMDriver, 'isConnected' | 'getProbeInfo' | 'getDeviceInfo'>> = {}
): INBMDriver {
  return {
    meta: { id: 'nbm550', port: 'COM3', name: 'NBM-550', type: 'nbm', baudRate: 460800 },
    status: 'connected',
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    isConnected: () => true,
    readMeasurement: vi.fn(async () => null),
    readBattery: vi.fn(async () => null),
    resetMaxHold: vi.fn(async () => {}),
    getProbeInfo: () => ({ model: 'EF-4000', serial: 'S-123', calibrationDate: '2025-06-01' }),
    getDeviceInfo: () => ({
      productName: 'NBM-550',
      productionId: null,
      serialNumber: 'NBM-001',
      deviceId: null,
      deviceType: null,
      firmwareVersion: null,
      calDate: '2025-06-01',
      calDueDate: null,
      noOfOptions: null,
      optionsName: null
    }),
    getMeterSerial: () => 'NBM-001',
    on: vi.fn(),
    removeAllListeners: vi.fn(),
    ...overrides
  }
}

function makeDeps(overrides: Partial<SettingsHandlerDeps> = {}): SettingsHandlerDeps {
  let appConfig = {}
  return {
    app: {
      getVersion: () => '0.16.1',
      getAppPath: () => '/app',
      isPackaged: false
    },
    readFile: vi.fn(() => '# CHANGELOG'),
    getNBM: vi.fn(() => makeFakeNbm()),
    probeDataService: {
      load: () => PROBE_RECORDS,
      getVersion: () => 3
    },
    config: {
      loadAppConfig: () => appConfig,
      updateAppConfig: (partial) => {
        appConfig = { ...appConfig, ...partial }
      }
    },
    ...overrides
  }
}

describe('matchProbeRecord', () => {
  it('matches an exact record after name normalization', () => {
    expect(matchProbeRecord(PROBE_RECORDS, 'ef 4000')?.name).toBe('EF-4000')
  })

  it('falls back to a substring match when there is no exact match', () => {
    const records: ProbeRecord[] = [
      { name: 'EF-4000', fMin: 0, fMax: 100, uncertainty: 0.1, factor: 1.25 }
    ]
    expect(matchProbeRecord(records, 'EF4000X')?.factor).toBe(1.25)
  })

  it('returns null when no record matches', () => {
    expect(matchProbeRecord(PROBE_RECORDS, 'UNKNOWN-999')).toBeNull()
  })

  it('returns null for an empty records list', () => {
    expect(matchProbeRecord([], 'EF-4000')).toBeNull()
  })
})

describe('registerSettingsHandlers', () => {
  it('GET_APP_VERSION returns the app version', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerSettingsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.GET_APP_VERSION)!(undefined)
    expect(result).toEqual({ version: '0.16.1' })
  })

  it('GET_CHANGELOG reads the changelog from the app path when not packaged', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerSettingsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.GET_CHANGELOG)!(undefined)
    expect(result).toEqual({ content: '# CHANGELOG' })
    expect(deps.readFile).toHaveBeenCalledWith(join('/app', 'CHANGELOG.md'))
  })

  it('GET_BUILT_IN_PROBE_DATA returns records and version', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerSettingsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.GET_BUILT_IN_PROBE_DATA)!(undefined)
    expect(result).toEqual({ success: true, version: 3, records: PROBE_RECORDS })
  })

  it('GET_PROBE_INFO returns probe info when the NBM is connected', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerSettingsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.GET_PROBE_INFO)!(undefined)
    expect(result).toEqual({
      success: true,
      probeInfo: { model: 'EF-4000', serial: 'S-123', calibrationDate: '2025-06-01' }
    })
  })

  it('GET_PROBE_INFO returns an error when the NBM is not connected', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps({
      getNBM: () => makeFakeNbm({ isConnected: () => false })
    })

    registerSettingsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.GET_PROBE_INFO)!(undefined)
    expect(result).toEqual({ success: false, error: 'NBM-550 no conectado' })
  })

  it('GET_PROBE_INFO returns an error when there is no NBM', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps({ getNBM: () => null })

    registerSettingsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.GET_PROBE_INFO)!(undefined)
    expect(result).toEqual({ success: false, error: 'NBM-550 no conectado' })
  })

  it('GET_DEVICE_INFO returns device info when the NBM is connected', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerSettingsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.GET_DEVICE_INFO)!(undefined)
    expect(result).toMatchObject({ success: true, deviceInfo: { serialNumber: 'NBM-001' } })
  })

  it('GET_ACTIVE_UNCERTAINTY returns nulls when there is no probe model', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps({
      getNBM: () =>
        makeFakeNbm({ getProbeInfo: () => ({ model: null, serial: null, calibrationDate: null }) })
    })

    registerSettingsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.GET_ACTIVE_UNCERTAINTY)!(undefined)
    expect(result).toEqual({ success: true, factor: null, matchedRecord: null, probeModel: null })
  })

  it('GET_ACTIVE_UNCERTAINTY resolves the matched record and factor', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerSettingsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.GET_ACTIVE_UNCERTAINTY)!(undefined)
    expect(result).toEqual({
      success: true,
      factor: 1.25,
      matchedRecord: PROBE_RECORDS[0],
      probeModel: 'EF-4000'
    })
  })

  it('GET_ACTIVE_UNCERTAINTY returns null factor when no record matches', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps({
      getNBM: () =>
        makeFakeNbm({
          getProbeInfo: () => ({ model: 'UNKNOWN-999', serial: 'S', calibrationDate: '2025' })
        })
    })

    registerSettingsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.GET_ACTIVE_UNCERTAINTY)!(undefined)
    expect(result).toEqual({
      success: true,
      factor: null,
      matchedRecord: null,
      probeModel: 'UNKNOWN-999'
    })
  })

  it('GET_SOUNDS_ENABLED returns true by default', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerSettingsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.GET_SOUNDS_ENABLED)!(undefined)
    expect(result).toEqual({ success: true, enabled: true })
  })

  it('GET_SOUNDS_ENABLED returns the configured value', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps({
      config: {
        loadAppConfig: () => ({ soundsEnabled: false }),
        updateAppConfig: vi.fn()
      }
    })

    registerSettingsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.GET_SOUNDS_ENABLED)!(undefined)
    expect(result).toEqual({ success: true, enabled: false })
  })

  it('SET_SOUNDS_ENABLED persists the value', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerSettingsHandlers(ipc, deps)

    await handlers.get(IPC_HANDLERS.SET_SOUNDS_ENABLED)!(undefined, false)
    const result = await handlers.get(IPC_HANDLERS.GET_SOUNDS_ENABLED)!(undefined)
    expect(result).toEqual({ success: true, enabled: false })
  })

  it('GET_NBM_CONNECTION_TYPE defaults to usb', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerSettingsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.GET_NBM_CONNECTION_TYPE)!(undefined)
    expect(result).toEqual({ success: true, connectionType: 'usb' })
  })

  it('GET_NBM_CONNECTION_TYPE reads the persisted connectionType', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps({
      config: {
        loadAppConfig: () => ({ connectionType: 'optical' }),
        updateAppConfig: vi.fn()
      }
    })

    registerSettingsHandlers(ipc, deps)

    const result = await handlers.get(IPC_HANDLERS.GET_NBM_CONNECTION_TYPE)!(undefined)
    expect(result).toEqual({ success: true, connectionType: 'optical' })
  })

  it('SET_NBM_CONNECTION_TYPE persists the value', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps()

    registerSettingsHandlers(ipc, deps)

    await handlers.get(IPC_HANDLERS.SET_NBM_CONNECTION_TYPE)!(undefined, 'optical')
    const result = await handlers.get(IPC_HANDLERS.GET_NBM_CONNECTION_TYPE)!(undefined)
    expect(result).toEqual({ success: true, connectionType: 'optical' })
  })

  it('GET_CHANGELOG rethrows a sanitized error when reading fails', async () => {
    const { ipc, handlers } = createFakeIpc()
    const deps = makeDeps({
      readFile: vi.fn(() => {
        throw new Error('ENOENT')
      })
    })

    registerSettingsHandlers(ipc, deps)

    await expect(handlers.get(IPC_HANDLERS.GET_CHANGELOG)!(undefined)).rejects.toThrow(
      'Archivo no encontrado.'
    )
  })
})
