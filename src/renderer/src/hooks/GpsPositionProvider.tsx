import { createContext, useEffect, useState, type ReactNode } from 'react'

export interface GpsPosition {
  lat: number
  lon: number
  alt: number
  heading?: number
}

export interface GpsPositionState {
  position: GpsPosition | null
  lastKnownPosition: GpsPosition | null
  heading?: number
}

const INITIAL: GpsPositionState = { position: null, lastKnownPosition: null, heading: undefined }

// eslint-disable-next-line react-refresh/only-export-components
export const GpsPositionContext = createContext<GpsPositionState>(INITIAL)

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
          position: {
            lat: data.coords.lat,
            lon: data.coords.lon,
            alt: data.coords.alt ?? 0,
            heading: data.coords.heading
          },
          lastKnownPosition: null,
          heading: data.coords.heading
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
