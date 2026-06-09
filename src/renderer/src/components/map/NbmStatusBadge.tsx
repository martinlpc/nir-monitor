import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { DeviceStatus } from '../../../../shared/device.types'

export default function NbmStatusBadge(): null {
  const map = useMap()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const statusRef = useRef<DeviceStatus>('disconnected')
  const batteryRef = useRef<number | null>(null)

  useEffect(() => {
    const container = L.DomUtil.create(
      'div',
      'leaflet-bar leaflet-control nbm-status-badge nbm-status-badge--disconnected'
    )

    const dot = L.DomUtil.create('span', 'nbm-status-badge__dot', container)
    const label = L.DomUtil.create('span', 'nbm-status-badge__label', container)
    label.textContent = 'NBM-550'
    const batterySpan = L.DomUtil.create('span', 'nbm-status-badge__battery', container)

    function updateUI(): void {
      const raw = statusRef.current
      const status = raw === 'error' ? 'disconnected' : raw
      const battery = batteryRef.current

      container.className = `leaflet-bar leaflet-control nbm-status-badge nbm-status-badge--${status}`

      const dotColor =
        status === 'connected' ? '#4ade80' : status === 'connecting' ? '#facc15' : '#6b7280'
      dot.style.background = dotColor

      if (raw === 'connected' && battery !== null) {
        batterySpan.textContent = `${battery}%`
      } else if (raw === 'connecting') {
        batterySpan.textContent = '...'
      } else {
        batterySpan.textContent = '---'
      }
    }

    L.DomEvent.disableClickPropagation(container)
    L.DomEvent.disableScrollPropagation(container)

    containerRef.current = container

    // Obtener estado inicial (los eventos previos al mount se pierden)
    window.api.devices.list().then((state) => {
      statusRef.current = state.nbm550.status
      updateUI()
    })

    const unsubStatus = window.api.devices.onStatus((data) => {
      if (data.deviceId !== 'nbm550') return
      statusRef.current = data.status
      updateUI()
    })

    const unsubSample = window.api.nbm.onSample((data) => {
      batteryRef.current = data.battery ?? null
      updateUI()
    })

    const control = new (L.Control.extend({
      onAdd() {
        return container
      },
      onRemove() {
        containerRef.current = null
      }
    }))({ position: 'topright' })

    control.addTo(map)

    return () => {
      unsubStatus()
      unsubSample()
      control.remove()
    }
  }, [map])

  return null
}
