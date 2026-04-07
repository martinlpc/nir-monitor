import { useEffect, useState, useCallback } from 'react'
import type { DeviceManagerStateDTO } from '../../../shared/dto'

/**
 * Hook para gestión del estado de dispositivos
 * Usa la API de window.api.devices para escaneo, conexión y eventos
 */
export function useDevices() {
  const [devices, setDevices] = useState<DeviceManagerStateDTO | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Scan para dispositivos disponibles
  const scan = useCallback(async () => {
    try {
      setIsScanning(true)
      setError(null)
      const result = await window.api.devices.scan()
      setDevices(result)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al escanear dispositivos'
      setError(message)
      throw err
    } finally {
      setIsScanning(false)
    }
  }, [])

  // Obtener lista de dispositivos conectados
  const list = useCallback(async () => {
    try {
      const result = await window.api.devices.list()
      setDevices(result)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al obtener lista'
      setError(message)
      throw err
    }
  }, [])

  // Configurar puerto para un dispositivo
  const setPort = useCallback(async (deviceType: 'nbm550' | 'gps', port: string) => {
    try {
      setError(null)
      const result = await window.api.devices.setPort(deviceType, port)
      setDevices(result)
      return result
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `Error al configurar puerto de ${deviceType}`
      setError(message)
      throw err
    }
  }, [])

  // Conectar a un puerto
  const connect = useCallback(
    async (deviceType: 'nbm550' | 'gps') => {
      try {
        setError(null)
        await window.api.devices.connect(deviceType)
        await list()
      } catch (err) {
        const message = err instanceof Error ? err.message : `Error al conectar ${deviceType}`
        setError(message)
        throw err
      }
    },
    [list]
  )

  // Desconectar dispositivo
  const disconnect = useCallback(
    async (deviceType: 'nbm550' | 'gps') => {
      try {
        setError(null)
        await window.api.devices.disconnect(deviceType)
        await list()
      } catch (err) {
        const message = err instanceof Error ? err.message : `Error al desconectar ${deviceType}`
        setError(message)
      }
    },
    [list]
  )

  // Listeners para cambios de estado en IPC
  useEffect(() => {
    // Estado inicial
    list().catch(console.error)

    // Listeners para cambios de estado
    const unsubscribeStatus = window.api.devices.onStatus(() => {
      list().catch(console.error)
    })

    const unsubscribeError = window.api.devices.onError((data) => {
      setError(`[${data.deviceId}] ${data.error}`)
    })

    const unsubscribeScan = window.api.devices.onScanState((state) => {
      setDevices(state)
    })

    return () => {
      unsubscribeStatus()
      unsubscribeError()
      unsubscribeScan()
    }
  }, [list])

  // Helpers
  const isConnected = (deviceType: 'nbm550' | 'gps'): boolean => {
    if (!devices) return false
    const device = deviceType === 'nbm550' ? devices.nbm550 : devices.gps
    return device.status === 'connected'
  }

  return {
    // Estado
    devices,
    nbm550: devices?.nbm550 ?? null,
    gps: devices?.gps ?? null,
    isScanning,
    error,
    scanning: isScanning || devices?.scanning || false,

    // Métodos
    scan,
    list,
    setPort,
    connect,
    disconnect,
    isConnected
  }
}
