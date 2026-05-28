import React, { useEffect, useRef, useState } from 'react'
import './toast.css'

export type ToastType = 'error' | 'warning' | 'info' | 'done'

export interface ToastData {
  id: string
  message: string
  type: ToastType
}

interface Props extends ToastData {
  onClose: () => void
}

const ICONS: Record<ToastType, string> = {
  error: '⛔',
  warning: '⚠️',
  info: 'ℹ️',
  done: '✅',
}

export default function Toast({ message, type, onClose }: Props) {
  const [hovered, setHovered] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Pausa el timer en hover (solo para autocierre)
  useEffect(() => {
    if (type === 'error') return // no autocierra
    if (!hovered) return
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    // El timer lo maneja el provider, solo pausamos
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [hovered, type])

  return (
    <div
      className={`toast toast--${type}`}
      role="status"
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="toast__icon" aria-hidden>{ICONS[type]}</span>
      <span className="toast__msg">{message}</span>
      <button
        className="toast__close"
        aria-label="Cerrar notificación"
        onClick={onClose}
        tabIndex={0}
      >
        ×
      </button>
    </div>
  )
}
