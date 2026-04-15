import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

interface MaximizeControlProps {
  maximized: boolean
  onToggle: () => void
}

export default function MaximizeControl({ maximized, onToggle }: MaximizeControlProps): null {
  const map = useMap()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const onToggleRef = useRef(onToggle)
  onToggleRef.current = onToggle

  useEffect(() => {
    const Control = L.Control.extend({
      onAdd() {
        const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control maximize-control')
        const btn = L.DomUtil.create('a', '', div)
        btn.href = '#'
        btn.title = maximized ? 'Restaurar vista' : 'Maximizar mapa'
        btn.setAttribute('aria-label', btn.title)
        btn.setAttribute('role', 'button')
        btn.innerHTML = maximized ? '⊡' : '⊞'

        L.DomEvent.disableClickPropagation(div)
        L.DomEvent.on(btn, 'click', (e) => {
          L.DomEvent.preventDefault(e)
          onToggleRef.current()
        })

        containerRef.current = div
        return div
      },
      onRemove() {
        containerRef.current = null
      }
    })

    const control = new Control({ position: 'topright' })
    control.addTo(map)

    return () => {
      control.remove()
    }
  }, [map, maximized])

  return null
}
