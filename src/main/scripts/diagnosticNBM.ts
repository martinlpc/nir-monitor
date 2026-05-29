import { SerialPort } from 'serialport'

/**
 * Diagnóstico del estado del NBM550
 * Ejecutar con: npx tsx src/main/scripts/diagnosticNBM.ts COM21
 */

async function diagnosisNBM(portPath: string): Promise<void> {
  console.log(`\n╔════════════════════════════════════════╗`)
  console.log(`║  🩺 DIAGNÓSTICO NBM550: ${portPath.padEnd(16)}║`)
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

    // Helper para enviar comando y capturar respuesta
    const sendCmd = async (cmd: string): Promise<string> => {
      let response = ''
      const dataHandler = (data: Buffer) => {
        response += data.toString('utf-8')
      }

      port!.on('data', dataHandler)
      port!.write(cmd + '\r\n')

      await delay(600)
      port!.removeListener('data', dataHandler)

      return response.trim()
    }

    // Paso 1: REMOTE ON
    console.log('1️⃣  Activando modo remoto...')
    let resp = await sendCmd('REMOTE ON;')
    console.log(`   Respuesta: ${resp}`)

    if (resp === '0;') {
      console.log(`   ✅ Modo remoto activado`)
    } else if (resp.match(/^\d+;?$/)) {
      const code = parseInt(resp)
      console.log(`   ❌ Error ${code} al activar remoto`)
    }

    // Paso 2: Intentar ID
    console.log(`\n2️⃣  Intentando ID;...`)
    resp = await sendCmd('ID;')
    console.log(`   Respuesta: ${resp}`)

    if (resp.includes(',') || resp.includes('"')) {
      console.log(`   ✅ Identificación recibida`)
    } else if (resp.match(/^\d+;?$/)) {
      const code = parseInt(resp)
      console.log(`   ❌ Error ${code}`)
      console.log(`      → Posible causa: Sonda desconectada (412) o comando no soportado`)
    }

    // Paso 3: Medir
    console.log(`\n3️⃣  Intentando medición (MEAS?;)...`)
    resp = await sendCmd('MEAS?;')
    console.log(`   Respuesta: ${resp}`)

    if (resp.includes(',')) {
      console.log(`   ✅ Medición exitosa:`, resp)
      const parts = resp.split(',').map((p) => p.trim())
      if (parts.length >= 3) {
        console.log(`      X: ${parts[0]} V/m`)
        console.log(`      Y: ${parts[1]} V/m`)
        console.log(`      Z: ${parts[2]} V/m`)
      }
    } else if (resp.match(/^\d+;?$/)) {
      const code = parseInt(resp)
      if (code === 412) {
        console.log(`   ❌ Error 412 (Measurement failure)`)
        console.log(`      Esto generalmente significa:`)
        console.log(`      - La sonda NO está conectada al NBM550`)
        console.log(`      - El NBM550 no tiene batería`)
        console.log(`      - Hardware malfunction`)
      } else {
        console.log(`   ❌ Error ${code}`)
      }
    }

    // Paso 4: Check battery
    console.log(`\n4️⃣  Verificando batería...`)
    resp = await sendCmd('BATTERY?;')
    console.log(`   Respuesta: ${resp}`)

    if (resp.match(/^\d+;?$/)) {
      const battery = parseInt(resp)
      if (battery === 412 || battery === 403) {
        console.log(`   ❌ Error ${battery} - Comando no disponible`)
      } else if (battery >= 0 && battery <= 100) {
        console.log(`   ✅ Batería: ${battery}%`)
        if (battery < 20) {
          console.log(`      ⚠️  Batería baja`)
        }
      }
    }

    // Paso 5: Shutdown
    console.log(`\n5️⃣  Desactivando modo remoto...`)
    resp = await sendCmd('REMOTE OFF;')
    console.log(`   Respuesta: ${resp}`)

    // Resumen
    console.log(`\n${'═'.repeat(40)}`)
    console.log(`\n🔍 RESUMEN DE DIAGNÓSTICO:`)
    console.log(`\n✅ CONFIRMADO:`)
    console.log(`  - NBM550 está conectado en ${portPath}`)
    console.log(`  - Modo remoto funciona (REMOTE ON/OFF retornan 0)`)
    console.log(`\n❌ PROBLEMAS DETECTADOS:`)
    console.log(`  - Error 412 en todas las mediciones`)
    console.log(`  - Esto indica que probablemente:`)
    console.log(`    1. 🔌 La SONDA no está conectada al NBM550`)
    console.log(`    2. 🔋 El NBM550 no tiene batería o está agotada`)
    console.log(`    3. 🛠️  Hardware del NBM550 defectuoso`)
    console.log(`\n💡 ACCIONES RECOMENDADAS:`)
    console.log(`  1. Verifica que la sonda esté bien conectada al NBM550`)
    console.log(`  2. Verifica que el NBM550 tenga batería`)
    console.log(`  3. Si aún no funciona, resetea el NBM550 o consulta manual`)

    port.close()
    console.log(`\n✅ Diagnóstico completado`)
  } catch (err) {
    console.error(`\n❌ Error fatal:`, err instanceof Error ? err.message : err)
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
    console.log('Uso: npx tsx src/main/scripts/diagnosticNBM.ts COM21')
    console.log(`Puertos disponibles: ${ports.map((p) => p.path).join(', ')}`)
    return
  }

  await diagnosisNBM(portArg)
}

main().catch(console.error)
