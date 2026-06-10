import { SerialPort } from 'serialport'
import { v4 as uuidv4 } from 'uuid'
import { NBM550Driver } from '../devices/nbm550/NBM550Driver'
import { GPSDriver } from '../devices/gps/GPSDriver'
import { SerialPortScanner } from '../infrastructure/SerialPortScanner'
import { resolveCorrectionFactor } from '../uncertainty/correctionFactor'
import type { GeoTimestamp } from '../../shared/GeoTimestamp'
import type { NBM550Config } from '../devices/nbm550/nbm550.types'

const NBM_BAUD = 460800
const GPS_BAUD = 4800
const GPS_FIX_TIMEOUT_MS = 60_000

interface CLIOptions {
  nbm?: string
  gps?: string
  rate: number
  count: number
  cf: number
  uncertaintyFile?: string
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2)
  const opts: CLIOptions = { rate: 3000, count: Infinity, cf: 1.0 }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--nbm':  opts.nbm = args[++i]; break
      case '--gps':  opts.gps = args[++i]; break
      case '--rate': opts.rate = parseInt(args[++i], 10); break
      case '--count': opts.count = parseInt(args[++i], 10); break
      case '--cf':   opts.cf = parseFloat(args[++i]); break
      case '--uncertainty-file': opts.uncertaintyFile = args[++i]; break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
      default:
        console.error(`\n❌ Flag desconocido: ${args[i]}`)
        printHelp()
        process.exit(1)
    }
  }

  if (isNaN(opts.rate) || opts.rate < 200) {
    console.error('\n❌ --rate debe ser ≥ 200ms')
    process.exit(1)
  }
  if (isNaN(opts.cf) || opts.cf <= 0) {
    console.error('\n❌ --cf debe ser > 0')
    process.exit(1)
  }

  return opts
}

function printHelp(): void {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  testFusion.ts — Prueba de fusión NBM-550 + GPS             ║
╚═══════════════════════════════════════════════════════════════╝

Uso:
  npx tsx src/main/scripts/testFusion.ts
  npx tsx src/main/scripts/testFusion.ts --nbm COM5 --gps COM3
  npx tsx src/main/scripts/testFusion.ts --nbm COM5 --gps COM3 --rate 3000 --count 20

Flags:
  --nbm <port>           Puerto NBM-550                    (default: auto-scan)
  --gps <port>           Puerto GPS                        (default: auto-scan)
  --rate <ms>            Intervalo entre capturas          (default: 3000)
  --count <N>            N° de muestras (Ctrl+C si se omite) (default: ∞)
  --cf <factor>          Factor de corrección fijo         (default: 1.0)
  --uncertainty-file <path>  Archivo de incertidumbre      (lee CF según sonda)
  -h, --help             Muestra esta ayuda
`)
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

async function waitForFix(gps: GPSDriver): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < GPS_FIX_TIMEOUT_MS) {
    if (gps.isPositionValid()) return true
    const state = gps.getState()
    const elapsed = Math.round((Date.now() - start) / 1000)
    process.stdout.write(`\r⏳ Esperando fix GPS... ${elapsed}s  (satélites: ${state.satelliteCount})   `)
    await new Promise(r => setTimeout(r, 1000))
  }
  console.log()
  return false
}

// ── Main ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs()
  let nbm: NBM550Driver | null = null
  let gps: GPSDriver | null = null
  let points: GeoTimestamp[] = []
  let running = true
  let seq = 0

  // ── Banner ──
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🧪 PRUEBA DE FUSIÓN NBM-550 + GPS                          ║
╚═══════════════════════════════════════════════════════════════╝
`)

  // ── Detectar puertos ──
  let nbmPort = opts.nbm
  let gpsPort = opts.gps

  if (!nbmPort || !gpsPort) {
    console.log('🔍 Escaneando puertos...\n')
    const scanner = new SerialPortScanner()
    const result = await scanner.scanAndProbeAll({ nbm550: opts.nbm, gps: opts.gps })
    nbmPort = result.nbmPort ?? opts.nbm
    gpsPort = result.gpsPort ?? opts.gps
  }

  if (!nbmPort) {
    const ports = (await SerialPort.list()).map(p => p.path)
    console.error('❌ NBM-550 no detectado')
    console.error('   Puertos disponibles:', ports.join(', ') || '(ninguno)')
    process.exit(1)
  }
  if (!gpsPort) {
    const ports = (await SerialPort.list()).map(p => p.path)
    console.error('❌ GPS no detectado')
    console.error('   Puertos disponibles:', ports.join(', ') || '(ninguno)')
    process.exit(1)
  }

  console.log(`   📡 NBM-550: ${nbmPort}  (${NBM_BAUD} baud)`)
  console.log(`   🛰️  GPS:     ${gpsPort}  (${GPS_BAUD} baud)`)
  console.log(`   ⏱️  Rate:    ${opts.rate}ms`)
  console.log(`   🔢 Count:   ${opts.count === Infinity ? '∞ (Ctrl+C)' : opts.count}`)

  // ── Conectar ──
  try {
    console.log('\n🔌 Conectando NBM-550...')
    const nbmConfig: NBM550Config = { port: nbmPort, baudRate: NBM_BAUD, pollIntervalMs: opts.rate, unit: 'V/m' }
    nbm = new NBM550Driver(nbmConfig)
    await nbm.connect()
    console.log('   ✅ NBM-550 conectado')

    // Leer info de sonda y resolver factor de corrección
    const probeInfo = nbm.getProbeInfo()
    const probeModel = probeInfo?.model ?? null
    console.log(`   🔬 Sonda: ${probeModel ?? 'desconocida'}`)

    if (probeModel && opts.uncertaintyFile) {
      const resolved = resolveCorrectionFactor(probeModel, opts.uncertaintyFile)
      if (resolved != null) {
        opts.cf = resolved
        console.log(`   ✅ CF desde archivo de incertidumbre: ${resolved}`)
      } else {
        console.log(`   ⚠️  No se encontró factor para "${probeModel}" en ${opts.uncertaintyFile}, usando --cf ${opts.cf}`)
      }
    } else if (probeModel && !opts.uncertaintyFile) {
      console.log(`   ℹ️  Usando --cf ${opts.cf}. Pasa --uncertainty-file para auto-resolver según sonda`)
    }

    console.log('\n🔌 Conectando GPS...')
    gps = new GPSDriver({ port: gpsPort, baudRate: GPS_BAUD })
    await gps.connect()
    console.log('   ✅ GPS conectado\n')
  } catch (err) {
    console.error('\n❌ Error de conexión:', err instanceof Error ? err.message : err)
    await nbm?.disconnect().catch(() => {})
    await gps?.disconnect().catch(() => {})
    process.exit(1)
  }

  // ── Esperar fix GPS ──
  console.log('⏳ Esperando fix GPS (máx 60s)...')
  const hasFix = await waitForFix(gps)
  if (!hasFix) {
    console.error('\n❌ No se obtuvo fix GPS después de 60s')
    await nbm.disconnect().catch(() => {})
    await gps.disconnect().catch(() => {})
    process.exit(1)
  }
  const fixInfo = gps.getState()
  console.log(`   ✅ Fix GPS: ${fixInfo.fixType}, ${fixInfo.satelliteCount} satélites, posición: ${fixInfo.position?.lat?.toFixed(4)}, ${fixInfo.position?.lon?.toFixed(4)}\n`)

  // ── Bucle de captura ──
  console.log('─'.repeat(70))

  async function capture(): Promise<void> {
    if (!running) return
    if (opts.count !== Infinity && seq >= opts.count) {
      running = false
      return
    }

    const position = gps!.getLastPosition()
    if (!position || !gps!.isPositionValid()) {
      console.log(`   ⏳ [${fmtTime(Date.now())}] Sin fix GPS, reintentando...`)
      setTimeout(capture, opts.rate)
      return
    }

    try {
      const sample = await nbm!.readMeasurement()
      if (!sample) {
        console.log(`   ⚠️  [${fmtTime(Date.now())}] NBM no retornó medición`)
        setTimeout(capture, opts.rate)
        return
      }

      seq++
      const correctedMeasurement = Math.round(sample.rss * opts.cf * 100) / 100

      const point: GeoTimestamp = {
        id: uuidv4(),
        sessionId: 'fusion-test',
        sequenceNumber: seq,
        timestamp: sample.timestamp,
        position: { ...position },
        emf: {
          deviceId: 'nbm550',
          rawMeasurement: sample.rss,
          unit: sample.unit as 'V/m' | 'A/m' | 'mW/cm^2' | 'W/m^2'
        },
        correctedMeasurement
      }

      points.push(point)

      // Resetear max hold como en funcionamiento normal
      try {
        await nbm!.resetMaxHold()
      } catch {
        // non-fatal
      }

      const line =  `[${String(seq).padStart(3, '0')}] ${fmtTime(point.timestamp)}  ` +
        `${point.position.lat.toFixed(6)}, ${point.position.lon.toFixed(6)}` +
        `${point.position.alt != null ? `, ${point.position.alt.toFixed(0)}m` : ''}  →  ` +
        `${point.emf.rawMeasurement.toFixed(2)} ${point.emf.unit}` +
        `  (corr: ${correctedMeasurement.toFixed(2)} | cf: ${opts.cf})`

      console.log(line)

      if (opts.count !== Infinity && seq >= opts.count) {
        running = false
        return
      }

      setTimeout(capture, opts.rate)
    } catch (err) {
      console.log(`   ⚠️  [${fmtTime(Date.now())}] Error lectura NBM: ${err instanceof Error ? err.message : err}`)
      setTimeout(capture, opts.rate)
    }
  }

  // ── Ctrl+C ──
  function shutdown(): void {
    if (!running) return
    running = false
    console.log('\n\n🛑 Deteniendo...')
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Arrancar
  capture()

  // Esperar a que termine (o Ctrl+C)
  while (running) {
    await new Promise(r => setTimeout(r, 200))
  }

  // ── Cleanup ──
  console.log('\n🔌 Desconectando...')
  await Promise.all([
    nbm.disconnect().catch(() => {}),
    gps.disconnect().catch(() => {})
  ])
  console.log('   ✅ Desconectado\n')

  // ── Resumen ──
  const duration = points.length > 0
    ? ((points[points.length - 1].timestamp - points[0].timestamp) / 1000).toFixed(1)
    : '0'

  console.log('─'.repeat(70))
  console.log(`\n📊 RESUMEN`)
  console.log(`   Sesión:    fusion-test`)
  console.log(`   Puntos:    ${points.length}`)
  console.log(`   Duración:  ${duration}s`)
  if (points.length > 0) {
    const rawValues = points.map(p => p.emf.rawMeasurement)
    const avg = rawValues.reduce((a, b) => a + b, 0) / rawValues.length
    console.log(`   Raw:       min ${Math.min(...rawValues).toFixed(2)}  /  max ${Math.max(...rawValues).toFixed(2)}  /  avg ${avg.toFixed(2)} V/m`)
    console.log(`   CF:        ${opts.cf}`)
    console.log(`   Primer:    ${fmtTime(points[0].timestamp)}  ${points[0].position.lat.toFixed(4)}, ${points[0].position.lon.toFixed(4)}`)
    console.log(`   Último:    ${fmtTime(points[points.length - 1].timestamp)}  ${points[points.length - 1].position.lat.toFixed(4)}, ${points[points.length - 1].position.lon.toFixed(4)}`)

    // Mostrar primer punto como GeoJSON
    console.log(`\n   Primer punto como GeoJSON:`)
    const geojsonPreview = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [points[0].position.lon, points[0].position.lat, points[0].position.alt]
      },
      properties: {
        id: points[0].id,
        sequenceNumber: points[0].sequenceNumber,
        sessionId: points[0].sessionId,
        timestamp: points[0].timestamp,
        rawMeasurement: points[0].emf.rawMeasurement,
        correctedMeasurement: points[0].correctedMeasurement,
        unit: points[0].emf.unit
      }
    }
    console.log(`   ${JSON.stringify(geojsonPreview, null, 4).split('\n').join('\n   ')}`)
  }
  console.log(`\n✅ Test completado\n`)
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
