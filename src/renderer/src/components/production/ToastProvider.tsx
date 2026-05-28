import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import Toast, { ToastData, ToastType } from './Toast'

interface ToastContextProps {
  notify: (toast: Omit<ToastData, 'id'>) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextProps | undefined>(undefined)

let toastId = 0

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const timers = useRef<Record<string, NodeJS.Timeout>>({})

  const dismiss = useCallback((id: string) => {
    setToasts(ts => ts.filter(t => t.id !== id))
    if (timers.current[id]) {
      clearTimeout(timers.current[id])
      delete timers.current[id]
    }
  }, [])

  const notify = useCallback((toast: Omit<ToastData, 'id'>) => {
    const id = `${Date.now()}-${toastId++}`
    setToasts(ts => [...ts, { ...toast, id }])
  }, [])

  // IPC listener
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' || window.location.search.includes('debug')) {
        // @ts-ignore asd
        window.__notify = notify
    }
    const handler = (_: unknown, payload: { message: string; type: ToastType }) => {
      notify({ message: payload.message, type: payload.type })
    }
    window.api?.on?.('alert', handler)
    return () => {
      window.api?.off?.('alert', handler)
    }
  }, [notify])

  // Timers
  useEffect(() => {
    toasts.forEach(toast => {
      if (toast.type === 'error') return // requiere acción manual
      if (timers.current[toast.id]) return // ya tiene timer
      const timeout = toast.type === 'warning' ? 7000 : 5000
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
        {toasts.map(toast => (
          <Toast key={toast.id} {...toast} onClose={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider')
  return ctx
}
