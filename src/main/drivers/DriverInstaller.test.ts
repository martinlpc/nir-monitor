import { describe, expect, it, vi } from 'vitest'
import { join } from 'path'
import { DriverInstaller, buildPnputilCommand, encodePowerShellCommand } from './DriverInstaller'
import type { DriverType } from '../../shared/driver.types'

const RESOURCES = 'C:\\Program Files\\RNI Monitor\\resources'

type ExecCallback = (error: Error | null) => void

function makeExec(error: Error | null = null): ReturnType<typeof vi.fn> {
  return vi.fn((_file: string, _args: string[], _options: unknown, callback: ExecCallback) => {
    callback(error)
  })
}

function decodeCommand(args: string[]): string {
  const encoded = args[args.indexOf('-EncodedCommand') + 1]
  return Buffer.from(encoded, 'base64').toString('utf16le')
}

describe('buildPnputilCommand', () => {
  it('keeps a path with spaces as a single quoted argument', () => {
    const infPath = `${RESOURCES}\\drivers\\ftdi\\ftdibus.inf`

    expect(buildPnputilCommand(infPath)).toBe(
      `Start-Process -FilePath pnputil.exe -ArgumentList '/add-driver "${infPath}" /install' -Verb RunAs -Wait -WindowStyle Hidden`
    )
  })

  it('escapes single quotes so the path cannot close the PowerShell literal', () => {
    const command = buildPnputilCommand("C:\\Users\\O'Brien\\drivers\\ser2pl.inf")

    expect(command).toContain(`'/add-driver "C:\\Users\\O''Brien\\drivers\\ser2pl.inf" /install'`)
  })
})

describe('encodePowerShellCommand', () => {
  it('encodes the command as base64 of UTF-16LE', () => {
    const encoded = encodePowerShellCommand('Write-Output "ñ"')
    expect(Buffer.from(encoded, 'base64').toString('utf16le')).toBe('Write-Output "ñ"')
  })
})

describe('DriverInstaller', () => {
  it('runs pnputil once per inf file of the driver', async () => {
    const exec = makeExec()
    const installer = new DriverInstaller(exec as never, () => RESOURCES)

    await installer.install('ftdi')

    expect(exec).toHaveBeenCalledTimes(2)
    const [file, args, options] = exec.mock.calls[0]
    expect(file).toBe('powershell.exe')
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand'])
    expect(options).toEqual({ windowsHide: true, timeout: 120000 })
    expect(decodeCommand(exec.mock.calls[0][1])).toContain(
      `"${join(RESOURCES, 'drivers', 'ftdi', 'ftdibus.inf')}"`
    )
    expect(decodeCommand(exec.mock.calls[1][1])).toContain(
      `"${join(RESOURCES, 'drivers', 'ftdi', 'ftdiport.inf')}"`
    )
  })

  it.each(['ch340', 'cp210x', 'cdc_acm', 'unknown'])(
    'rejects %s because it has no bundled installer',
    async (driverType) => {
      const exec = makeExec()
      const installer = new DriverInstaller(exec as never, () => RESOURCES)

      await expect(installer.install(driverType as DriverType)).rejects.toThrow(
        /No bundled installer/
      )
      expect(exec).not.toHaveBeenCalled()
    }
  )

  it.each(['constructor', '__proto__', 'toString', '..\\..\\evil', ''])(
    'rejects the unexpected driver type %j coming from the renderer',
    async (driverType) => {
      const exec = makeExec()
      const installer = new DriverInstaller(exec as never, () => RESOURCES)

      await expect(installer.install(driverType as DriverType)).rejects.toThrow(
        /No bundled installer/
      )
      expect(exec).not.toHaveBeenCalled()
    }
  )

  it('stops at the first failing inf and reports the error', async () => {
    const exec = makeExec(new Error('exit code 1'))
    const installer = new DriverInstaller(exec as never, () => RESOURCES)

    await expect(installer.install('ftdi')).rejects.toThrow('pnputil failed: exit code 1')
    expect(exec).toHaveBeenCalledTimes(1)
  })
})
