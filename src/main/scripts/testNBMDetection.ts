import { SerialPort } from 'serialport'
import { NBM550Driver } from '../devices/nbm550/NBM550Driver'
import { NBM550Parser } from '../devices/nbm550/NBM550Parser'

const NBM_BAUD_RATE = 460800

/**
 * Script de diagnóstico para testear la detección y comunicación del NBM550
 * Ejecutar con: npx ts-node src/main/scripts/testNBMDetection.ts
 */

async function listPorts(): Promise<void> {
  console.log('\n=== 📋 PUERTOS DISPONIBLES ===\n')
  try {
    const ports = await SerialPort.list()
    if (ports.length === 0) {
      console.log('❌ No se encontraron puertos seriales')
      return
    }

    ports.forEach((port, idx) => {
      console.log(`[${idx}] ${port.path}`)
      console.log(`    Manufacturer: ${port.manufacturer || 'desconocido'}`)
      console.log(`    Serial Number: ${port.serialNumber || 'desconocido'}`)
      console.log(`    Product ID: ${port.productId || 'desconocido'}`)
      console.log()
    })
  } catch (err) {
    console.error('Error listando puertos:', err)
  }
}

async function testRawConnection(portPath: string): Promise<void> {
  console.log(`\n=== 🔌 TEST CONEXIÓN CRUDA: ${portPath} ===\n`)

  let port: SerialPort | null = null

  try {
    port = new SerialPort({
      path: portPath,
      baudRate: NBM_BAUD_RATE,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false
    })

    console.log('⏳ Abriendo puerto...')
    await new Promise<void>((resolve, reject) => {
      port!.open((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    console.log('✅ Puerto abierto')

    // Escuchar datos sin procesar
    let dataReceived = false
    let totalBytes = 0
    const rawBuffer: string[] = []

    port.on('data', (data: Buffer) => {
      dataReceived = true
      totalBytes += data.length
      const decoded = data.toString('utf-8')
      rawBuffer.push(decoded)
      console.log(`📥 Datos recibidos (${data.length} bytes):`, JSON.stringify(decoded))
    })

    console.log('⏳ Esperando datos iniciales (5 segundos)...')
    await new Promise((r) => setTimeout(r, 5000))

    if (!dataReceived) {
      console.log('⚠️  No se recibieron datos iniciales')
    } else {
      console.log(`✅ Se recibieron datos: ${totalBytes} bytes total`)
      console.log(`📊 Buffer completo: ${JSON.stringify(rawBuffer.join(''))}`)
    }

    // Intentar enviar REMOTE ON
    console.log('\n⏳ Enviando comando: REMOTE ON')
    port.write('REMOTE ON\r')

    await new Promise((r) => setTimeout(r, 2000))

    port.close()
    console.log('✅ Puerto cerrado')
  } catch (err) {
    console.error('❌ Error en conexión cruda:', err instanceof Error ? err.message : err)
    if (port?.isOpen) {
      try {
        port.close()
      } catch (e) {
        // Ignorar
      }
    }
  }
}

async function testNBMDriver(portPath: string): Promise<void> {
  console.log(`\n=== 🎯 TEST NBM DRIVER: ${portPath} ===\n`)

  const driver = new NBM550Driver({
    port: portPath,
    baudRate: NBM_BAUD_RATE,
    pollIntervalMs: 200,
    unit: 'V/m'
  })

  let errorOccurred = false

  driver.on('error', (err) => {
    console.error('❌ Driver error:', err.message)
    errorOccurred = true
  })

  driver.on('sample', (sample) => {
    console.log('✅ Muestra recibida:', sample)
  })

  try {
    console.log('⏳ Iniciando quickProbe...')
    await Promise.race([
      driver.quickProbe(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('QuickProbe timeout')), 5000)
      )
    ])
    console.log('✅ QuickProbe exitoso!')
  } catch (err) {
    console.error('❌ QuickProbe falló:', err instanceof Error ? err.message : JSON.stringify(err))
  } finally {
    try {
      await driver.disconnect()
      console.log('✅ Driver desconectado')
    } catch (err) {
      console.error('⚠️  Error desconectando:', err instanceof Error ? err.message : err)
    }
  }
}

async function testParser(): Promise<void> {
  console.log('\n=== 🧪 TEST PARSER ===\n')

  const parser = new NBM550Parser()

  // Casos de prueba
  const testCases = [
    { name: 'Respuesta válida', input: '10.5, 12.3, 8.7, 0, 85;', expected: 'valid' },
    { name: 'Error 412', input: '412;', expected: 'error' },
    { name: 'Respuesta sin punto decimal', input: '10, 12, 8, 0, 85;', expected: 'valid' },
    {
      name: 'Respuesta con espacios extra',
      input: '  10.5  ,  12.3  ,  8.7  ;  ',
      expected: 'valid'
    },
    { name: 'Respuesta malformada', input: 'garbage', expected: 'invalid' }
  ]

  testCases.forEach(({ name, input, expected }) => {
    console.log(`\nPrueba: "${name}"`)
    console.log(`Entrada: ${JSON.stringify(input)}`)

    if (parser.isErrorResponse(input)) {
      console.log('Resultado: ❌ Error response')
    } else {
      const sample = parser.parseMeasurement(input)
      if (sample) {
        console.log('Resultado: ✅ Medición válida:', sample)
      } else {
        console.log('Resultado: ⚠️  No se pudo parsear')
      }
    }
  })
}

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════╗')
  console.log('║  🔍 DIAGNÓSTICO NBM550 DETECTION     ║')
  console.log('╚════════════════════════════════════════╝')

  try {
    // Paso 1: Listar puertos
    await listPorts()

    // Paso 2: Obtener puerto del usuario o usar el primero disponible
    const ports = await SerialPort.list()
    if (ports.length === 0) {
      console.log('\n❌ No hay puertos disponibles. Conecta el NBM550.')
      process.exit(1)
    }

    // Intentar con cada puerto (o usar uno específico)
    const targetPort = process.argv[2] || ports[0].path
    console.log(`\n📍 Puerto objetivo: ${targetPort}`)

    // Paso 3: Test conexión cruda
    await testRawConnection(targetPort)

    // Paso 4: Test driver NBM
    await testNBMDriver(targetPort)

    // Paso 5: Test parser
    await testParser()

    console.log('\n' + '═'.repeat(40))
    console.log('✅ Diagnóstico completado')
  } catch (err) {
    console.error('❌ Error fatal:', err)
    process.exit(1)
  }
}

main().catch(console.error)
