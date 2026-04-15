import { useEffect, useState } from 'react'
import type { DeviceStatus } from '../../../../shared/device.types'
import { useGpsPosition } from '../../hooks/useGpsPosition'

type GpsInfo = {
  lat?: number
  lon?: number
  alt?: number
}

type NBMInfo = {
  rss?: number
  unit?: string
  battery?: number
}

export function useGpsCardInfo(enabled: boolean): GpsInfo {
  const { position } = useGpsPosition()

  if (!enabled || !position) return {}

  return {
    lat: position.lat,
    lon: position.lon,
    alt: position.alt
  }
}

export function useNbmCardInfo(enabled: boolean, status: DeviceStatus): NBMInfo {
  const [nbmInfo, setNbmInfo] = useState<NBMInfo>({})

  useEffect(() => {
    if (enabled && (status === 'disconnected' || status === 'error')) {
      setNbmInfo({})
    }
  }, [enabled, status])

  useEffect(() => {
    if (!enabled) return

    const unsubscribe = window.api.nbm.onSample((data) => {
      setNbmInfo({
        rss: data.rss,
        unit: data.unit,
        battery: data.battery
      })
    })

    return () => {
      unsubscribe()
    }
  }, [enabled])

  return nbmInfo
}
