// Extrae lógica de probe de DeviceManager - reutilizable y testeable
import { SerialPort } from 'serialport'
import { NBM550Driver } from '../devices/nbm550/NBM550Driver'
import { GPSDriver } from '../devices/gps/GPSDriver'
import type { ISerialPortScanner } from '../../shared/services/ISerialPortScanner'
import type { ProbedDeviceInfo } from '../../shared/dto/index'

const NBM_BAUD_RATE = 460800
const GPS_BAUD_RATE = 4800
const PROBE_TIMEOUT_MS = 3000
const NMEA_LISTEN_MS = 4000

export class SerialPortScanner implements ISerialPortScanner {
  async listAvailablePorts(): Promise<string[]> {
    const ports = await SerialPort.list()
    return ports.map((p) => p.path)
  }

  async scanAndProbeAll(): Promise<{
    nbmPort: string | null
    gpsPort: string | null
    allProbed: ProbedDeviceInfo[]
  }> {
    const ports = await this.listAvailablePorts()
    console.log(`[SerialPortScanner] Found ${ports.length} ports:`, ports)

    let nbmPort: string | null = null
    let gpsPort: string | null = null
    const allProbed: ProbedDeviceInfo[] = []

    for (const port of ports) {
      if (nbmPort && gpsPort) break

      if (!nbmPort) {
        const isNBM = await this.probeNBM(port)
        if (isNBM) {
          nbmPort = port
          allProbed.push({ port, type: 'nbm550' })
          continue
        }
      }

      if (!gpsPort) {
        const isGPS = await this.probeGPS(port)
        if (isGPS) {
          gpsPort = port
          allProbed.push({ port, type: 'gps' })
        }
      }
    }

    console.log(`[SerialPortScanner] Scan complete. NBM: ${nbmPort}, GPS: ${gpsPort}`)
    return { nbmPort, gpsPort, allProbed }
  }

  async probeNBM(port: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
    console.log(`[SerialPortScanner] Probing NBM550 on ${port}...`)
    try {
      const driver = new NBM550Driver({
        port,
        baudRate: NBM_BAUD_RATE,
        pollIntervalMs: 200,
        unit: 'V/m'
      })

      const connectPromise = driver.connect()
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Probe timeout')), timeoutMs)
      )

      await Promise.race([connectPromise, timeoutPromise])
      await driver.disconnect()
      console.log(`[SerialPortScanner] ✓ NBM550 detected on ${port}`)
      return true
    } catch (error) {
      console.log(`[SerialPortScanner] ✗ NBM550 not found on ${port}`)
      return false
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
        const time = setTimeout(() => {
          driver.removeAllListeners('gps:fix')
          driver.disconnect().catch(() => {})
          resolve(false)
        }, timeoutMs)

        driver.once('gps:fix', async () => {
          clearTimeout(time)
          await driver.disconnect()
          console.log(`[SerialPortScanner] ✓ GPS detected on ${port}`)
          resolve(true)
        })

        driver.connect().catch(() => {
          clearTimeout(time)
          resolve(false)
        })
      })
    } catch (error) {
      console.log(`[SerialPortScanner] ✗ GPS not found on ${port}`)
      return false
    }
  }
}
