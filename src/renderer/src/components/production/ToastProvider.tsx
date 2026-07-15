import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import Toast, { ToastData, ToastType } from './Toast'
import { soundManager } from '../../audio/SoundManager'

interface ToastContextProps {
  notify: (toast: Omit<ToastData, 'id'>) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextProps | undefined>(undefined)

let toastId = 0

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const timers = useRef<Record<string, NodeJS.Timeout>>({})

  // Load sounds setting on mount
  useEffect(() => {
    window.api?.settings?.getSoundsEnabled?.().then((res) => {
      if (res.success) {
        soundManager.setEnabled(res.enabled)
      }
    })
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((ts) => ts.filter((t) => t.id !== id))
    if (timers.current[id]) {
      clearTimeout(timers.current[id])
      delete timers.current[id]
    }
  }, [])

  const notify = useCallback((toast: Omit<ToastData, 'id'>) => {
    const id = `${Date.now()}-${toastId++}`
    setToasts((ts) => [...ts, { ...toast, id }])
  }, [])

  // IPC listener
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' || window.location.search.includes('debug')) {
      // @ts-ignore asd
      window.__notify = notify
    }
    const handler = (
      _: unknown,
      payload: { message: string; type: string; userAction?: string }
    ): void => {
      notify({
        message: payload.message,
        type: payload.type as ToastType,
        userAction: payload.userAction
      })

      // Trigger sounds for specific alerts
      const msg = payload.message.toLowerCase()
      if (msg.includes('desconectado') && !msg.includes('reconectado')) {
        soundManager.play('device-disconnect')
      } else if (msg.includes('perdió la señal gps')) {
        soundManager.play('gps-fix-lost')
      } else if (msg.includes('gps con fix')) {
        soundManager.play('gps-fix-recovered')
      } else if (msg.includes('reconectado')) {
        soundManager.play('device-reconnected')
      }
    }
    const unsubscribe = window.api?.on?.('alert', handler)
    return () => unsubscribe?.()
  }, [notify])

  // Timers
  useEffect(() => {
    toasts.forEach((toast) => {
      if (toast.type === 'error') return // requiere confirmación manual
      if (timers.current[toast.id]) return
      const timeout = toast.type === 'info' ? 3000 : 5000
      timers.current[toast.id] = setTimeout(() => dismiss(toast.id), timeout)
    })
    return () => {
      Object.values(timers.current).forEach(clearTimeout)
      timers.current = {}
    }
  }, [toasts, dismiss])

  return (
    <ToastContext.Provider value={{ notify, dismiss }}>
      {children}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} onClose={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextProps {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider')
  return ctx
}
