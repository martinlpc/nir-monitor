// Extrae lógica de probe de DeviceManager - reutilizable y testeable
import { SerialPort } from 'serialport'
import { NBM550Driver } from '../devices/nbm550/NBM550Driver'
import { GPSDriver } from '../devices/gps/GPSDriver'
import type { ISerialPortScanner } from '../../shared/services/ISerialPortScanner'
import type { ProbedDeviceInfo } from '../../shared/dto/index'

const NBM_BAUD_RATE = 460800
const GPS_BAUD_RATE = 4800
const PROBE_TIMEOUT_MS = 3000
const NMEA_LISTEN_MS = 10000 // Aumentado de 4s a 10s para permitir sincronización GPS

export class SerialPortScanner implements ISerialPortScanner {
  async listAvailablePorts(): Promise<string[]> {
    const ports = await SerialPort.list()
    return ports.map((p) => p.path)
  }

  async scanAndProbeAll(preferred?: { gps?: string; nbm550?: string }): Promise<{
    nbmPort: string | null
    gpsPort: string | null
    allProbed: ProbedDeviceInfo[]
  }> {
    const ports = await this.listAvailablePorts()
    console.log(`[SerialPortScanner] Found ${ports.length} ports:`, ports)

    let nbmPort: string | null = null
    let gpsPort: string | null = null
    const allProbed: ProbedDeviceInfo[] = []

    // Paso 0: probar primero los puertos preferidos (última sesión conocida)
    if (preferred?.gps && ports.includes(preferred.gps)) {
      console.log(`[SerialPortScanner] Trying preferred GPS port: ${preferred.gps}`)
      const isGPS = await this.probeGPS(preferred.gps)
      if (isGPS) {
        gpsPort = preferred.gps
        allProbed.push({ port: preferred.gps, type: 'gps' })
        console.log(`[SerialPortScanner] ✓ GPS confirmed on preferred port ${preferred.gps}`)
      } else {
        console.log(
          `[SerialPortScanner] Preferred GPS port ${preferred.gps} did not respond, will scan all`
        )
      }
    }

    if (preferred?.nbm550 && ports.includes(preferred.nbm550)) {
      console.log(`[SerialPortScanner] Trying preferred NBM port: ${preferred.nbm550}`)
      const isNBM = await this.probeNBM(preferred.nbm550)
      if (isNBM) {
        nbmPort = preferred.nbm550
        allProbed.push({ port: preferred.nbm550, type: 'nbm550' })
        console.log(`[SerialPortScanner] ✓ NBM550 confirmed on preferred port ${preferred.nbm550}`)
      } else {
        console.log(
          `[SerialPortScanner] Preferred NBM port ${preferred.nbm550} did not respond, will scan all`
        )
      }
    }

    // Si ambos ya están resueltos, no hace falta escanear
    if (nbmPort && gpsPort) {
      console.log(`[SerialPortScanner] Both devices found via preferred ports. Skipping full scan.`)
      return { nbmPort, gpsPort, allProbed }
    }

    // Paso 1: buscar GPS en los puertos restantes (excluir los ya asignados)
    const remainingPorts = ports.filter((p) => p !== gpsPort && p !== nbmPort)

    if (!gpsPort) {
      for (const port of remainingPorts) {
        if (gpsPort) {
          break
        }
        const isGPS = await this.probeGPS(port)
        if (isGPS) {
          gpsPort = port
          allProbed.push({ port, type: 'gps' })
          console.log(`[SerialPortScanner] GPS assigned to ${port}, stopping GPS scan`)
        }
      }
    }

    // Paso 2: buscar NBM550 en los puertos que no fueron tomados por GPS
    if (!nbmPort) {
      const portsForNBM = ports.filter((p) => p !== gpsPort && p !== nbmPort)
      for (const port of portsForNBM) {
        const isNBM = await this.probeNBM(port)
        if (isNBM) {
          nbmPort = port
          allProbed.push({ port, type: 'nbm550' })
          console.log(`[SerialPortScanner] NBM550 found on ${port}, stopping scan`)
          break
        }
      }
    }

    console.log(`[SerialPortScanner] Scan complete. NBM: ${nbmPort}, GPS: ${gpsPort}`)
    return { nbmPort, gpsPort, allProbed }
  }

  async probeNBM(port: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
    console.log(`[SerialPortScanner] Probing NBM550 on ${port}...`)
    const driver = new NBM550Driver({
      port,
      baudRate: NBM_BAUD_RATE,
      pollIntervalMs: 200,
      unit: 'V/m'
    })

    try {
      const probePromise = driver.quickProbe()
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Probe timeout')), timeoutMs)
      )

      await Promise.race([probePromise, timeoutPromise])
      console.log(`[SerialPortScanner] ✓ NBM550 detected on ${port}`)
      return true
    } catch (error) {
      console.log(`[SerialPortScanner] ✗ NBM550 not found on ${port}`)
      return false
    } finally {
      // Asegurar que el puerto se cierra aunque falle la conexión
      // Esperar un bit para permitir que las escrituras finales se completen
      await new Promise((r) => setTimeout(r, 200))
      // Silenciar errores EPIPE durante desconexión (puerto ya cerrado)
      try {
        await driver.disconnect()
      } catch (err) {
        // Ignorar errores de disconnection (EPIPE, EBADF, etc.)
        if (!(err instanceof Error && /EPIPE|EBADF|closed/.test(err.message))) {
          console.log(`[SerialPortScanner] Cleanup error on ${port}:`, err)
        }
      }
    }
  }

  async probeGPS(port: string, timeoutMs = NMEA_LISTEN_MS): Promise<boolean> {
    console.log(`[SerialPortScanner] Probing GPS on ${port}...`)
    try {
      const driver = new GPSDriver({
        port,
        baudRate: GPS_BAUD_RATE
      })

      return await new Promise<boolean>((resolve) => {
        let resolved = false

        const time = setTimeout(() => {
          console.log(`[SerialPortScanner] GPS probe timeout on ${port}`)
          if (!resolved) {
            resolved = true
            driver.removeAllListeners('position')
            driver.removeAllListeners('nmea')
            driver.disconnect().catch(() => {})
            resolve(false)
          }
        }, timeoutMs)

        // Aceptar cualquier dato NMEA válido (no solo posiciones con fix)
        driver.once('nmea', (line: string) => {
          console.log(
            `[SerialPortScanner] GPS NMEA received on ${port}: ${line.substring(0, 20)}...`
          )
          if (!resolved) {
            resolved = true
            clearTimeout(time)
            driver.removeAllListeners('nmea')
            driver.disconnect()
            console.log(`[SerialPortScanner] ✓ GPS detected on ${port}`)
            resolve(true)
          }
        })

        driver.on('error', (err) => {
          console.log(`[SerialPortScanner] GPS connection error on ${port}:`, err.message)
          if (!resolved) {
            resolved = true
            clearTimeout(time)
            resolve(false)
          }
        })

        driver.connect().catch((err) => {
          console.log(`[SerialPortScanner] GPS connect error on ${port}:`, err.message)
          if (!resolved) {
            resolved = true
            clearTimeout(time)
            resolve(false)
          }
        })
      })
    } catch (error) {
      console.log(
        `[SerialPortScanner] ✗ GPS not found on ${port}:`,
        error instanceof Error ? error.message : error
      )
      return false
    }
  }
}
