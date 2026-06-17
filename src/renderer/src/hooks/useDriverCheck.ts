import { useState, useCallback } from 'react'
import type { DriverCheckResult, DriverType } from '../../../shared/driver.types'

export function useDriverCheck(): {
  driverStatus: DriverCheckResult | null
  check: () => Promise<void>
  install: (type: DriverType) => Promise<void>
  installing: DriverType | null
  error: string | null
} {
  const [driverStatus, setDriverStatus] = useState<DriverCheckResult | null>(null)
  const [installing, setInstalling] = useState<DriverType | null>(null)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async (): Promise<void> => {
    try {
      const result = await window.api.drivers.check()
      setDriverStatus(result)
      setError(null)
    } catch (err) {
      console.error('[useDriverCheck] check failed:', err)
    }
  }, [])

  const install = useCallback(
    async (type: DriverType): Promise<void> => {
      setInstalling(type)
      setError(null)
      try {
        await window.api.drivers.install(type)
        await check()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido'
        setError(msg)
        console.error('[useDriverCheck] install failed:', err)
      } finally {
        setInstalling(null)
      }
    },
    [check]
  )

  return { driverStatus, check, install, installing, error }
}
