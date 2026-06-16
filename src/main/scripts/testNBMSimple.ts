import { SerialPort } from 'serialport'

/**
 * Test simple y directo del NBM550
 * Ejecutar con: npx tsx src/main/scripts/testNBMSimple.ts [PORT]
 */

async function testNBMSimple(portPath: string): Promise<void> {
  console.log(`\n╔════════════════════════════════════════╗`)
  console.log(`║  🎯 TEST NBM550 SIMPLE: ${portPath.padEnd(15)}║`)
  console.log(`╚════════════════════════════════════════╝\n`)

  let port: SerialPort | null = null
  const NBM_BAUD_RATE = 460800

  try {
    // Paso 1: Listar puertos
    console.log('1️⃣  Listando puertos...')
    const ports = await SerialPort.list()
    const found = ports.find((p) => p.path === portPath)

    if (!found) {
      console.log(`❌ Puerto ${portPath} no encontrado`)
      console.log('Puertos disponibles:')
      ports.forEach((p) => console.log(`   - ${p.path}`))
      return
    }
    console.log(`✅ Encontrado en ${found.path} (${found.manufacturer})`)

    // Paso 2: Esperar un poco (para limpiar locks)
    console.log(`\n2️⃣  Esperando 1 segundo para limpiar...`)
    await new Promise((r) => setTimeout(r, 1000))

    // Paso 3: Abrir puerto
    console.log(`\n3️⃣  Abriendo puerto ${portPath}...`)
    port = new SerialPort({
      path: portPath,
      baudRate: NBM_BAUD_RATE,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false,
      lock: false // Permitir acceso compartido
    })

    await new Promise<void>((resolve, reject) => {
      port!.open((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    console.log(`✅ Puerto abierto`)

    // Paso 4: Setup listener
    console.log(`\n4️⃣  Esperando respuesta del NBM...`)
    let responses: string[] = []

    port.on('data', (data) => {
      const text = data.toString('utf-8').trim()
      if (text) {
        responses.push(text)
        console.log(`   📥 Recibido: ${JSON.stringify(text)}`)
      }
    })

    // Paso 5: Enviar comando inicial
    console.log(`   Enviando: REMOTE ON;`)
    port.write('REMOTE ON;\r\n')

    // Esperar respuesta
    await new Promise((r) => setTimeout(r, 2000))

    if (responses.length > 0) {
      console.log(`\n✅ NBM550 RESPONDIÓ!`)
      console.log(`   Respuestas:`, responses)
    } else {
      console.log(`\n⚠️  Sin respuesta inicial del NBM550`)
      console.log(`   Intentando SAMPLE_RATE 5;`)

      responses = []
      port.write('SAMPLE_RATE 5;\r\n')
      await new Promise((r) => setTimeout(r, 2000))

      if (responses.length > 0) {
        console.log(`✅ Ahora respondió:`, responses)
      } else {
        console.log(`❌ NBM550 no responde a comandos`)
        console.log(`\n🔍 Diagnóstico:`)
        console.log(`   - ¿Está el NBM550 encendido?`)
        console.log(`   - ¿Está el cable USB conectado?`)
        console.log(`   - ¿La conexión serial es correcta?`)
      }
    }

    // Paso 6: Enviar MEAS?
    console.log(`\n5️⃣  Solicitando medición (MEAS?;)...`)
    responses = []
    port.write('MEAS?;\r\n')

    await new Promise((r) => setTimeout(r, 1000))

    if (responses.length > 0) {
      console.log(`✅ Medición recibida:`, responses)
      // Intentar parsear
      const raw = responses[0]
      const parts = raw.split(',').map((p) => p.trim())
      if (parts.length >= 3) {
        const rss = parseFloat(parts[0])
        if (!isNaN(rss)) {
          console.log(`   X: ${parts[0]} V/m`)
          console.log(`   Y: ${parts[1]} V/m`)
          console.log(`   Z: ${parts[2]} V/m`)
          if (parts[4]) {
            console.log(`   Battery: ${parts[4]}%`)
          }
        }
      }
    } else {
      console.log(`⚠️  No hay respuesta a MEAS?`)
    }

    // Paso 7: Cerrar
    console.log(`\n6️⃣  Cerrando puerto...`)
    port.write('REMOTE OFF;\r\n')
    await new Promise((r) => setTimeout(r, 500))
    port.close()
    console.log(`✅ Cerrado`)

    console.log(`\n════════════════════════════════════════`)
    console.log(`✅ Test completado`)
  } catch (err) {
    console.error(`\n❌ Error:`, err instanceof Error ? err.message : err)
    if (port?.isOpen) {
      try {
        port.close()
      } catch {
        // ignore
      }
    }
  }
}

async function main(): Promise<void> {
  const portArg = process.argv[2]

  if (!portArg) {
    const ports = await SerialPort.list()
    if (ports.length === 0) {
      console.log('No ports found')
      return
    }
    console.log('Uso: npx tsx src/main/scripts/testNBMSimple.ts COM21')
    console.log(`Puertos disponibles: ${ports.map((p) => p.path).join(', ')}`)
    return
  }

  await testNBMSimple(portArg)
}

main().catch(console.error)
