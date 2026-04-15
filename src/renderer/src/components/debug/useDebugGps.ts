import { useCallback, useEffect, useState } from 'react'
import type { NmeaEntry } from './types'

export function useDebugGps() {
  const [gpsFix, setGpsFix] = useState(false)
  const [gpsText, setGpsText] = useState('Sin datos')
  const [nmeaLines, setNmeaLines] = useState<NmeaEntry[]>([])

  useEffect(() => {
    const offGps = window.api.gps.onPosition((data) => {
      setGpsFix(data.valid)

      if (!data.coords) {
        setGpsText(`GPS ${data.valid ? 'valido' : 'sin fix'}`)
        return
      }

      setGpsText(
        `${data.valid ? 'fix' : 'sin fix'} lat=${data.coords.lat.toFixed(6)} lon=${data.coords.lon.toFixed(6)} alt=${data.coords.alt.toFixed(1)}`
      )
    })

    const offNmea = window.api.gps.onNmea((data) => {
      setNmeaLines((current) =>
        [
          {
            kind: 'nmea',
            id: Date.now() + Math.random(),
            timestamp: new Date().toLocaleTimeString('es-AR', { hour12: false }),
            port: data.port,
            line: data.line
          },
          ...current
        ].slice(0, 30)
      )
    })

    return () => {
      offGps()
      offNmea()
    }
  }, [])

  const clearNmeaLines = useCallback(() => setNmeaLines([]), [])

  return { gpsFix, gpsText, nmeaLines, clearNmeaLines }
}
