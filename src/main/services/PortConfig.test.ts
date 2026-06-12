import { describe, expect, it, vi, beforeEach } from 'vitest'
import { loadPortConfig, savePortConfig } from './PortConfig'

const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()

vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args)
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/fake/userData') }
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PortConfig', () => {
  it('returns empty object when file does not exist', () => {
    mockExistsSync.mockReturnValue(false)
    expect(loadPortConfig()).toEqual({})
  })

  it('parses and returns JSON from file', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{"nbm550":"COM3","gps":"COM4"}')
    expect(loadPortConfig()).toEqual({ nbm550: 'COM3', gps: 'COM4' })
  })

  it('returns empty object on malformed JSON', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{invalid}')
    expect(loadPortConfig()).toEqual({})
  })

  it('writes config to file', () => {
    savePortConfig({ nbm550: 'COM7' })
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({ nbm550: 'COM7' }, null, 2),
      'utf-8'
    )
  })

  it('uses custom configPath when provided', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{"nbm550":"COM5"}')

    expect(loadPortConfig('/custom/path/ports.json')).toEqual({ nbm550: 'COM5' })
    expect(mockReadFileSync).toHaveBeenCalledWith('/custom/path/ports.json', 'utf-8')
  })

  it('uses custom configPath for save when provided', () => {
    savePortConfig({ gps: 'COM8' }, '/custom/path/ports.json')
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/custom/path/ports.json',
      expect.any(String),
      'utf-8'
    )
  })
})
