---
name: serial-probing
description: Serial port scanning and device detection — GPS NMEA listener and NBM-550 command-response probe
---

Archivo: `src/main/infrastructure/SerialPortScanner.ts`

## Baud rates

- GPS: 4800
- NBM-550: 460800

## Timeouts

- NBM probe: 6s (antes 3s, aumentado por respuesta lenta a REMOTE ON)
- GPS probe: 12s (aumentado para permitir sincronizacion GPS)

## Estrategia de scanning

```
1. Puertos preferidos (ultima sesion conocida)
   -> si el puerto preferido responde, se asigna directo
   -> si no responde, se escanean todos

2. Escaneo GPS en puertos restantes
   -> Abre puerto, escucha NMEA por 12s
   -> Si recibe cualquier linea NMEA valida -> GPS detectado

3. Escaneo NBM-550 en puertos restantes
   -> Abre puerto a 460800, envia REMOTE ON
   -> Espera respuesta "OK;" hasta 6s
   -> Si responde -> NBM-550 detectado
```

## Funciones clave

```typescript
listAvailablePorts(): Promise<string[]>
  -> SerialPort.list() -> paths

scanAndProbeAll(preferred?): Promise<{ nbmPort, gpsPort, allProbed }>
  -> preferred: { gps?: string, nbm550?: string }

probeNBM(port, timeoutMs=6000): Promise<boolean>
  -> crea NBM550Driver, llama quickProbe()
  -> Promise.race entre probe y timeout

probeGPS(port, timeoutMs=12000): Promise<boolean>
  -> crea GPSDriver, escucha evento 'nmea'
  -> Promise.race entre primer NMEA y timeout
```

## Cleanup

- Siempre cierra el driver despues de probe (incluso en fallo)
- Espera 200-300ms entre close y retorno
- Ignora errores EPIPE/EBADF/closed en cleanup

## Simulacion

- `NIR_SIMULATION=true` -> scanner mock retorna `COM-sim` siempre
- `createSimulatedScanner()` en `ServiceFactory.ts`
