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
  probeModel?: string | null
  probeSerial?: string | null
  calibrationDate?: string | null
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

  // Fetch probe info when connected
  useEffect(() => {
    if (!enabled || status !== 'connected') return
    window.api.settings.getProbeInfo().then((res) => {
      if (res.success && res.probeInfo) {
        setNbmInfo((prev) => ({
          ...prev,
          probeModel: res.probeInfo!.model,
          probeSerial: res.probeInfo!.serial,
          calibrationDate: res.probeInfo!.calibrationDate
        }))
      }
    })
  }, [enabled, status])

  useEffect(() => {
    if (!enabled) return

    const unsubscribe = window.api.nbm.onSample((data) => {
      setNbmInfo((prev) => ({
        ...prev,
        rss: data.rss,
        unit: data.unit,
        battery: data.battery
      }))
    })

    return () => {
      unsubscribe()
    }
  }, [enabled])

  return nbmInfo
}
