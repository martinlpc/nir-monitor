import { useMap } from 'react-leaflet'
import { useCallback, useRef, useEffect } from 'react'
import L from 'leaflet'

const PAN_OFFSET = 100

export default function PanControl(): React.JSX.Element {
  const map = useMap()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      L.DomEvent.disableClickPropagation(containerRef.current)
      L.DomEvent.disableScrollPropagation(containerRef.current)
    }
  }, [])

  const pan = useCallback(
    (dx: number, dy: number) => {
      map.panBy([dx, dy], { animate: true, duration: 0.25 })
    },
    [map]
  )

  return (
    <div className="leaflet-top leaflet-left pan-control-wrapper">
      <div ref={containerRef} className="leaflet-control leaflet-bar pan-control">
        <button className="pan-btn pan-up" title="Mover arriba" aria-label="Mover mapa arriba" onClick={() => pan(0, -PAN_OFFSET)}>▲</button>
        <div className="pan-row">
          <button className="pan-btn pan-left" title="Mover izquierda" aria-label="Mover mapa a la izquierda" onClick={() => pan(-PAN_OFFSET, 0)}>◀</button>
          <button className="pan-btn pan-right" title="Mover derecha" aria-label="Mover mapa a la derecha" onClick={() => pan(PAN_OFFSET, 0)}>▶</button>
        </div>
        <button className="pan-btn pan-down" title="Mover abajo" aria-label="Mover mapa abajo" onClick={() => pan(0, PAN_OFFSET)}>▼</button>
      </div>
    </div>
  )
}
