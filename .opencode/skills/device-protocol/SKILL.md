---
name: device-protocol
description: Serial device protocols — NMEA 0183 GPS and NBM-550 binary
---

## GPS (NMEA 0183)
- Baud rate: 4800
- Formato: texto ASCII, lineas terminadas en \r\n
- Parser: ReadlineParser de serialport + nmea-simple (v3.3)
- Sentencias clave: GGA, RMC, GSA
- Driver: `src/main/devices/gps/GPSDriver.ts`

## NBM-550
- Baud rate: 460800
- Formato: binario, comando-respuesta, delimiter `;`
- Comandos: REMOTE ON, MEAS?, LOCAL
- Driver: `src/main/devices/nbm550/NBM550Driver.ts`
- Parser: `src/main/devices/nbm550/NBM550Parser.ts`

## Simulación
- NIR_SIMULATION=true en entorno -> drivers simulados
- `src/main/devices/simulated/SimulatedGPSDriver.ts`
- `src/main/devices/simulated/SimulatedNBM550Driver.ts`
