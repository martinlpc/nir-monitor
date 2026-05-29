import { SerialPort } from 'serialport'

/**
 * Test de comandos NBM550 para identificar qué está disponible
 * Ejecutar con: npx tsx src/main/scripts/testNBMCommands.ts COM21
 */

async function testNBMCommands(portPath: string): Promise<void> {
  console.log(`\n╔════════════════════════════════════════╗`)
  console.log(`║  🔬 TEST COMANDOS NBM550: ${portPath.padEnd(14)}║`)
  console.log(`╚════════════════════════════════════════╝\n`)

  let port: SerialPort | null = null
  const NBM_BAUD_RATE = 460800

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

  try {
    port = new SerialPort({
      path: portPath,
      baudRate: NBM_BAUD_RATE,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false,
      lock: false
    })

    await new Promise<void>((resolve, reject) => {
      port!.open((err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    console.log(`✅ Puerto abierto\n`)

    let responses: string[] = []
    port.on('data', (data) => {
      const text = data.toString('utf-8').trim()
      if (text) responses.push(text)
    })

    // Lista de comandos a probar
    const commandTests = [
      { cmd: 'ID;', desc: 'Identificación del dispositivo' },
      { cmd: 'VERSION;', desc: 'Versión del firmware' },
      { cmd: 'RESET;', desc: 'Reset del dispositivo' },
      { cmd: 'REMOTE;', desc: 'REMOTE sin parámetro' },
      { cmd: 'REMOTE ON;', desc: 'Activar modo remoto' },
      { cmd: 'REMOTE OFF;', desc: 'Desactivar modo remoto' },
      { cmd: 'STATUS;', desc: 'Estado del dispositivo' },
      { cmd: 'MEAS?;', desc: 'Solicitar medición' },
      { cmd: 'MEAS;', desc: 'MEAS sin interrogación' },
      { cmd: 'SAMPLE_RATE;', desc: 'SAMPLE_RATE sin parámetro' },
      { cmd: 'SAMPLE_RATE 5;', desc: 'SAMPLE_RATE 5' },
      { cmd: 'HELP;', desc: 'Comando de ayuda' },
      { cmd: '?;', desc: 'Interrogación simple' },
      { cmd: 'PROBE_INFO?;', desc: 'Información de sonda' },
      { cmd: 'BATTERY?;', desc: 'Nivel de batería' }
    ]

    console.log('📝 Testeando comandos...\n')
    console.log('┌─ Comando ─────────────────────────┬─ Respuesta ────────────┬─ Error? ┐')

    for (const { cmd, desc } of commandTests) {
      responses = []
      port.write(cmd + '\r\n')
      await delay(800)

      const response = responses[0] || '(sin respuesta)'
      const isError = /^\d+;?$/.test(response.replace(/;?$/, ''))
      const errorMark = isError ? '❌' : '✅'

      console.log(`│ ${cmd.padEnd(35)} │ ${response.padEnd(22)} │ ${errorMark}`)
    }

    console.log('└────────────────────────────────────┴────────────────────────┴─────────┘')

    // Análisis de errores
    console.log(`\n📊 ANÁLISIS DE ERRORES:`)
    console.log(`- Errores numéricos (ej: 404;) = Comando no soportado o error`)
    console.log(`- 0; = Comando ejecutado exitosamente`)
    console.log(`- Otro formato = Respuesta válida`)

    port.close()
    console.log(`\n✅ Test completado`)
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
    console.log('Uso: npx tsx src/main/scripts/testNBMCommands.ts COM21')
    console.log(`Puertos disponibles: ${ports.map((p) => p.path).join(', ')}`)
    return
  }

  await testNBMCommands(portArg)
}

main().catch(console.error)
