import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export interface GpsPosition {
  lat: number
  lon: number
  alt: number
}

interface GpsPositionState {
  /** Current valid GPS position, or null if no fix */
  position: GpsPosition | null
  /** Last known position before fix was lost */
  lastKnownPosition: GpsPosition | null
}

const INITIAL: GpsPositionState = { position: null, lastKnownPosition: null }

const GpsPositionContext = createContext<GpsPositionState>(INITIAL)

export function GpsPositionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState<GpsPositionState>(INITIAL)

  useEffect(() => {
    const clearLive = (): void => {
      setState((prev) => ({
        position: null,
        lastKnownPosition: prev.position ?? prev.lastKnownPosition
      }))
    }

    const unsubPosition = window.api.gps.onPosition((data) => {
      if (data.valid && data.coords) {
        setState({
          position: { lat: data.coords.lat, lon: data.coords.lon, alt: data.coords.alt ?? 0 },
          lastKnownPosition: null
        })
      } else {
        clearLive()
      }
    })

    const unsubFixLost = window.api.gps.onFixLost(clearLive)

    const unsubStatus = window.api.devices.onStatus((data) => {
      if (data.deviceId === 'gps' && data.status !== 'connected') {
        clearLive()
      }
    })

    return () => {
      unsubPosition()
      unsubFixLost()
      unsubStatus()
    }
  }, [])

  return <GpsPositionContext.Provider value={state}>{children}</GpsPositionContext.Provider>
}

export function useGpsPosition(): GpsPositionState {
  return useContext(GpsPositionContext)
}
