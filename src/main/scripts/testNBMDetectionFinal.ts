import { NBM550Driver } from '../devices/nbm550/NBM550Driver'

/**
 * Test final de detección NBM550 usando el Driver
 * Ejecutar con: npx tsx src/main/scripts/testNBMDetectionFinal.ts COM21
 */

async function testDetection(portPath: string): Promise<void> {
  console.log(`\n╔════════════════════════════════════════╗`)
  console.log(`║  🎯 PRUEBA FINAL DETECCIÓN: ${portPath.padEnd(11)}║`)
  console.log(`╚════════════════════════════════════════╝\n`)

  const driver = new NBM550Driver({
    port: portPath,
    baudRate: 460800,
    pollIntervalMs: 200,
    unit: 'V/m'
  })

  try {
    console.log(`⏳ Iniciando quickProbe con timeouts aumentados...`)
    console.log(`   (Esto puede tomar hasta 6 segundos)`)

    const startTime = Date.now()

    await driver.quickProbe()

    const elapsed = Date.now() - startTime
    console.log(`\n✅ ÉXITO! NBM550 detectado`)
    console.log(`   Tiempo total: ${elapsed}ms`)
    console.log(`   Estado: ${driver.status}`)
    console.log(`   Metadata: ${JSON.stringify(driver.meta, null, 2)}`)

    // Intentar leer una medición
    console.log(`\n⏳ Intentando leer medición...`)
    const sample = await driver.readMeasurement()

    if (sample) {
      console.log(`✅ Medición exitosa:`)
      console.log(`   RSS: ${sample.rss} ${sample.unit}`)
      console.log(`   Batería: ${sample.battery}%`)
      console.log(`   Timestamp: ${new Date(sample.timestamp).toISOString()}`)
    } else {
      console.log(`⚠️  No se pudo leer medición`)
    }

    // Limpiar
    await driver.disconnect()
    console.log(`\n✅ Desconectado`)
  } catch (err) {
    console.error(`\n❌ Error:`, err instanceof Error ? err.message : err)

    // Intentar limpiar de todas formas
    try {
      await driver.disconnect()
    } catch {
      // ignore
    }
  }
}

async function main(): Promise<void> {
  const portArg = process.argv[2]

  if (!portArg) {
    console.log('Uso: npx tsx src/main/scripts/testNBMDetectionFinal.ts COM21')
    process.exit(1)
  }

  await testDetection(portArg)
}

main().catch(console.error)
