---
name: device-protocol
description: Serial device protocols — NMEA 0183 GPS and NBM-550 binary
---

## GPS (NMEA 0183)
- Baud rate: 4800, 8N1
- Formato: texto ASCII, lineas terminadas en \r\n
- Parser: ReadlineParser de serialport + nmea-simple (v3.3)

### Sentencias clave
```
$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47
  |     |      |        |         | |  |   |   |    |   |
  |     |      lat      lon        | |  |   |   |    |   diff
  |     time   ddmm.mmmm dddmm.mmmm fix sat hdop alt
  type                                                    checksum

$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A
  |     |     |      |        |         |     |     |      |     |
  |     time  status lat      lon        speed course date  mag var
  type                                                        checksum

$GPGSA,A,3,01,02,03,04,05,06,07,08,,,,,0.9,0.5,0.8*3C
  |     | |  |-- sat PRNs --|            |     |     |
  |     | |  sat used                   PDOP HDOP VDOP
  |     | fix: 1=no, 2=2D, 3=3D
  type  auto/manual
```

### Driver
- `src/main/devices/gps/GPSDriver.ts`
- Parseo via `nmea-simple`: `parseNmeaSentence(line)` -> `{ latitude, longitude, altitude, ... }`
- Timeout: 10s para detectar NMEA valido en probe
- Emite eventos: `position`, `fix_lost`, `error`

## NBM-550
- Baud rate: 460800, 8N1
- Formato: binario, comando-respuesta, delimiter `;`
- Timeout comando: 2000ms individual, 3000ms probe inicial

### Comandos
```
REMOTE ON     -> activa modo remoto, respuesta esperada "OK;"
MEAS?         -> pide medicion actual
                 -> respuesta: "meas_result;RSS,V/m,batt_level,X.X;"
                 -> ejemplo: "meas_result;12.34,V/m,85.5;"
LOCAL         -> vuelve a modo local
```

### Polling
- Intervalo: 200ms en polling loop
- Parseo: buffer acumulativo hasta encontrar `;`, luego se procesan segmentos
- Filtros: saltar respuestas vacias o iguales a la anterior (sin cambio)

### Simulación
- `NIR_SIMULATION=true` en entorno -> drivers simulados
- `src/main/devices/simulated/SimulatedGPSDriver.ts` -> posiciones mock alrededor de Neuquen (-38.95, -68.06)
- `src/main/devices/simulated/SimulatedNBM550Driver.ts` -> valores RSS variables entre 0.1 y 50 V/m
