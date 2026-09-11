import { GarminUSBDriver } from '../devices/gps/garmin/GarminUSBDriver'
import { detectGarminUsb } from '../devices/gps/garmin/GarminUsbDetector'
import { GARMIN_USB_PORT_PREFIX } from '../devices/gps/garmin/GarminUSBProtocol'
import type { GeoPosition } from '../../shared/GeoTimestamp'
import type { AppErrorInfo } from '../../shared/errors/error.types'

/**
 * Script de diagnóstico para testear la conexión USB directa con el Garmin 18x USB
 * Ejecutar con: npm run test:garmin
 *
 * Requiere que el Garmin 18x USB esté configurado con WinUSB (Zadig) en Windows.
 */
const DURATION_MS = parseInt(process.argv[2] ?? '15000', 10)
let samples = 0
let fixes = 0

function formatPosition(pos: GeoPosition): string {
  return [
    `lat=${pos.lat.toFixed(6)}`,
    `lon=${pos.lon.toFixed(6)}`,
    `alt=${pos.alt.toFixed(1)}m MSL`,
    `spd=${(pos.speed ?? 0).toFixed(1)}km/h`,
    `hdg=${(pos.heading ?? 0).toFixed(1)}°`
  ].join('  ')
}

async function main(): Promise<void> {
  console.log('\n=== 📡 GARMIN 18X USB - TEST DE CONEXIÓN ===\n')

  const status = await detectGarminUsb()
  console.log(`Presencia: ${status.present ? 'SÍ' : 'NO'}`)
  console.log(`Accesible (WinUSB): ${status.accessible ? 'SÍ' : 'NO'}`)

  if (!status.present || !status.accessible) {
    console.error('\n❌ El Garmin 18x USB no está conectado o no es accesible.')
    console.error('   En Windows, configurarlo con WinUSB (Zadig) antes de continuar.')
    process.exit(1)
  }

  const driver = new GarminUSBDriver({ port: GARMIN_USB_PORT_PREFIX })

  driver.on('nmea', (line: string) => {
    console.log(`  NMEA/info: ${line}`)
  })

  driver.on('position', (coords: GeoPosition | null, valid: boolean) => {
    samples++
    if (valid && coords) fixes++
    const tag = valid ? '✓' : '✗'
    console.log(
      `  [${tag}] ${valid ? formatPosition(coords!) : 'sin fix (se mantiene última posición)'}`
    )
  })

  driver.on('fix-lost', () => {
    console.log('  ⚠ fix-lost (se perdió la señal)')
  })

  try {
    await driver.connect()
  } catch (err) {
    const info = (err as { toAppErrorInfo?: () => AppErrorInfo }).toAppErrorInfo?.()
    console.error(`\n❌ No se pudo conectar: ${err instanceof Error ? err.message : String(err)}`)
    if (info) console.error(`   código: ${info.code} (${info.severity}/${info.category})`)
    process.exit(1)
  }

  const product = driver.getProduct()
  if (product) {
    console.log(`\n✅ Producto: ${product.productName} (versión ${product.softwareVersion})`)
  }
  console.log(`✅ Puerto: ${driver.meta.port}`)

  console.log(`\n--- Escuchando PVT por ${DURATION_MS / 1000}s ---`)

  await new Promise<void>((resolve) => {
    setTimeout(resolve, DURATION_MS)
  })

  await driver.disconnect()

  console.log('\n=== RESUMEN ===')
  console.log(`Muestras recibidas: ${samples}`)
  console.log(`Con fix válido: ${fixes}`)
  console.log(
    fixes > 0 ? '\n✅ El Garmin 18x USB funciona correctamente.' : '\n⚠ No se obtuvo fix.'
  )
  process.exit(fixes > 0 ? 0 : 1)
}

void main()
