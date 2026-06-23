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
  mode?: 'active' | 'standby'
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
  const [liveData, setLiveData] = useState<NBMInfo>({})

  // Fetch probe info when connected
  useEffect(() => {
    if (!enabled || status !== 'connected') return
    window.api.settings.getProbeInfo().then((res) => {
      if (res.success && res.probeInfo) {
        setLiveData((prev) => ({
          ...prev,
          probeModel: res.probeInfo!.model,
          probeSerial: res.probeInfo!.serial,
          calibrationDate: res.probeInfo!.calibrationDate
        }))
      }
    })
  }, [enabled, status])

  // Listen for live samples
  useEffect(() => {
    if (!enabled || status !== 'connected') return

    const unsubscribe = window.api.nbm.onSample((data) => {
      setLiveData((prev) => ({
        ...prev,
        rss: data.rss,
        unit: data.unit,
        battery: data.battery
      }))
    })

    return () => {
      unsubscribe()
    }
  }, [enabled, status])

  // Independent battery listener (fires even in standby, every 30s)
  useEffect(() => {
    if (!enabled || status !== 'connected') return

    const unsubscribe = window.api.nbm.onBattery((battery) => {
      setLiveData((prev) => ({ ...prev, battery }))
    })

    return () => {
      unsubscribe()
    }
  }, [enabled, status])

  // Mode listener (standby / active)
  useEffect(() => {
    if (!enabled || status !== 'connected') return

    const unsubscribe = window.api.nbm.onMode((mode) => {
      setLiveData((prev) => ({ ...prev, mode }))
    })

    return () => {
      unsubscribe()
    }
  }, [enabled, status])

  const isActive = enabled && status === 'connected'
  if (!isActive) return {}
  return { ...liveData, mode: liveData.mode ?? 'standby' }
}
