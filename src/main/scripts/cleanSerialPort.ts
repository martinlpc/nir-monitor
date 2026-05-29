import { SerialPort } from 'serialport'

/**
 * Script para limpiar puertos bloqueados
 * Ejecutar con: npx tsx src/main/scripts/cleanSerialPort.ts [PORT]
 */

async function cleanPort(portPath: string): Promise<void> {
  console.log(`\n╔════════════════════════════════════════╗`)
  console.log(`║  🧹 LIMPIAR PUERTO: ${portPath.padEnd(20)}║`)
  console.log(`╚════════════════════════════════════════╝\n`)

  try {
    console.log('1️⃣  Listando todos los puertos...')
    const ports = await SerialPort.list()
    const portInfo = ports.find((p) => p.path === portPath)

    if (!portInfo) {
      console.log(`⚠️  Puerto ${portPath} no encontrado. Puertos disponibles:`)
      ports.forEach((p) => {
        console.log(`   - ${p.path} (${p.manufacturer || 'unknown'})`)
      })
      return
    }

    console.log(`✅ Puerto encontrado:`)
    console.log(`   Path: ${portInfo.path}`)
    console.log(`   Manufacturer: ${portInfo.manufacturer || 'unknown'}`)
    console.log(`   Serial: ${portInfo.serialNumber || 'unknown'}`)

    console.log(`\n2️⃣  Esperando 2 segundos para limpiar procesos pendientes...`)
    await new Promise((r) => setTimeout(r, 2000))

    console.log(`\n3️⃣  Intentando abrir puerto con espera...`)
    let retries = 3
    let success = false

    while (retries > 0 && !success) {
      try {
        const port = new SerialPort({
          path: portPath,
          baudRate: 460800,
          autoOpen: false
        })

        console.log(`   Intento ${4 - retries}/3...`)

        await new Promise<void>((resolve, reject) => {
          port.open((err) => {
            if (err) reject(err)
            else resolve()
          })
        })

        console.log(`✅ Puerto abierto exitosamente!`)

        // Intentar enviar y recibir un comando simple
        console.log(`\n4️⃣  Probando comunicación...`)
        port.write('REMOTE OFF\r')

        let hasData = false
        const dataHandler = () => {
          hasData = true
        }

        port.on('data', dataHandler)

        await new Promise((r) => setTimeout(r, 1000))

        port.removeListener('data', dataHandler)

        if (hasData) {
          console.log(`✅ Puerto responde correctamente`)
        } else {
          console.log(`⚠️  No hay respuesta, pero puerto está desbloqueado`)
        }

        port.close()
        console.log(`✅ Puerto cerrado limpiamente`)
        success = true
      } catch (err) {
        retries--
        console.log(
          `❌ Error (reintentos restantes: ${retries}):`,
          err instanceof Error ? err.message : err
        )

        if (retries > 0) {
          console.log(`   Esperando antes de reintentar...`)
          await new Promise((r) => setTimeout(r, 1000))
        }
      }
    }

    if (success) {
      console.log(`\n✅ Puerto ${portPath} limpiado correctamente`)
      console.log(`Ahora puedes intentar conectarte de nuevo.`)
    } else {
      console.log(`\n❌ No se pudo limpiar el puerto después de 3 intentos`)
      console.log(`Intenta:`)
      console.log(`  1. Desconectar y reconectar el dispositivo USB`)
      console.log(`  2. Reiniciar Node/Electron`)
      console.log(`  3. Usar Device Manager para liberar el puerto en Windows`)
    }
  } catch (err) {
    console.error('Error fatal:', err)
  }
}

async function main(): Promise<void> {
  const portArg = process.argv[2]

  if (!portArg) {
    console.log('Uso: npx tsx src/main/scripts/cleanSerialPort.ts COM21')
    process.exit(1)
  }

  await cleanPort(portArg)
}

main()
