import { useEffect, useRef, useState } from 'react'
import type { DeviceStatus } from '../../../../shared/device.types'

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
  const [gpsInfo, setGpsInfo] = useState<GpsInfo>({})
  const fixTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!enabled) return

    const unsubscribePosition = window.api.gps.onPosition((data) => {
      if (data.valid && data.coords) {
        if (fixTimeoutRef.current) {
          clearTimeout(fixTimeoutRef.current)
          fixTimeoutRef.current = null
        }

        setGpsInfo({
          lat: data.coords.lat,
          lon: data.coords.lon,
          alt: data.coords.alt
        })

        fixTimeoutRef.current = setTimeout(() => {
          setGpsInfo({})
          fixTimeoutRef.current = null
        }, 5000)
      } else {
        if (fixTimeoutRef.current) {
          clearTimeout(fixTimeoutRef.current)
          fixTimeoutRef.current = null
        }
        setGpsInfo({})
      }
    })

    return () => {
      unsubscribePosition()
      if (fixTimeoutRef.current) {
        clearTimeout(fixTimeoutRef.current)
        fixTimeoutRef.current = null
      }
    }
  }, [enabled])

  return gpsInfo
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
