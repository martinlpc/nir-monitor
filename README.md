# RNI Monitor

![Version](https://img.shields.io/badge/version-0.9.1-blue.svg)

**Non-Ionizing Radiation Mapper** — Desktop application for mapping electromagnetic field (EMF) measurements based on **ITU-T Recommendation K.113**.

Desarrollado por el [Ente Nacional de Comunicaciones (ENACOM)](https://www.enacom.gob.ar), organismo regulador de comunicaciones de la República Argentina.

---

## Overview

`RNI Monitor` se conecta a un **Narda NBM-550** (medidor de campo eléctrico de banda ancha) y a un **receptor GPS** (compatible NMEA 0183) vía puerto serial para capturar lecturas georreferenciadas de radiación no ionizante. Los datos se visualizan en tiempo real sobre un mapa interactivo, se almacenan localmente en una base de datos SQLite cifrada y pueden exportarse en múltiples formatos normalizados.

## Features

- **Gestión de dispositivos** — Escaneo automático de puertos serie, conexión/desconexión de NBM-550 y GPS, reconexión automática ante desconexión inesperada.
- **Captura en tiempo real** — Sondeo del NBM-550 cada 200 ms con fusión de posición GPS mediante trigger por distancia (Haversine) o por tiempo.
- **Mapa interactivo** — Visualización de puntos de medición sobre Leaflet con marcadores color-coded (verde → rojo según % MEP) y polilíneas de recorrido.
- **Gestión de sesiones** — Inicio, pausa y finalización de sesiones de medición. Carga y comparación de sesiones históricas.
- **Factores de corrección** — Factores de incertidumbre embebidos para sondas Narda (EF0391, EF1891, EF6091, EF6092, HF3061, HF0191) aplicados automáticamente.
- **Modo simulación** — Ejecución con `NIR_SIMULATION=true` o flag `--simulation` para desarrollo y testing sin hardware físico.
- **Exportación multi-formato** — GeoJSON (cifrado), CSV, XLSX (tres archivos ENACOM) y KMZ (Google Earth).
- **Caché de tiles offline** — Precarga y almacenamiento local de tiles de mapas para operación sin conexión.
- **Base de datos cifrada** — SQLite con AES-256-GCM, protección contra manipulación externa.
- **Auto-update** — Mecanismo de actualización integrado via electron-updater.

## Tech Stack

| Capa               | Tecnología                                  |
| ------------------ | ------------------------------------------- |
| Shell desktop      | Electron 42 + electron-vite 5 + Vite 7      |
| Frontend           | React 19 + TypeScript 5.9 (strict)          |
| Mapas              | Leaflet 1.9 + react-leaflet 5               |
| Comunicación serie | serialport 13                               |
| Parsing GPS        | nmea-simple 3.3                             |
| Base de datos      | sql.js (SQLite WASM)                        |
| Exportación        | exceljs 4.4, archiver 7.0                   |
| Testing            | Vitest 4.1 + coverage V8                    |
| Empaquetado        | electron-builder 26 (NSIS / DMG / AppImage) |

## Prerequisitos

- **Node.js** >= 20
- **npm** >= 9

## Setup

```bash
# Instalar dependencias
npm install

# Desarrollo (hot reload)
npm run dev

# Tests
npm test

# Lint
npm run lint

# Typecheck
npm run typecheck
```

## Build

```bash
# Windows (NSIS installer)
npm run build:win

# macOS (DMG)
npm run build:mac

# Linux (AppImage + snap + deb)
npm run build:linux
```

La ruta de instalación en Windows es `Program Files\ENACOM\RNI Monitor`. Los artefactos de build se generan en `dist/`.

### Build en Windows — Clave de cifrado

El instalador NSIS inyecta `NIR_DB_ENCRYPTION_KEY` como variable de entorno a nivel de máquina
durante la instalación.

**Flujo de compilación:**

```bash
npm run generate:nsh-key   # Lee .env y genera build/key.nsh
npm run build              # Typecheck + electron-vite build
electron-builder --win     # Empaqueta NSIS
```

`npm run build:win` ejecuta los tres pasos automáticamente.

> **Seguridad:** La passphrase se lee del archivo `.env` (gitignored) y se transforma a un `!define`
> de NSIS en `build/key.nsh` (también gitignored). La clave nunca se hardcodea en el código fuente
> ni viaja en el ASAR de la aplicación. Solo el instalador tiene acceso a la clave para escribirla
> en el registro del sistema.

## Scripts Clave

| Comando               | Propósito                             |
| --------------------- | ------------------------------------- |
| `npm run dev`         | Dev con hot reload                    |
| `npm run build`       | Typecheck + build production          |
| `npm test`            | Vitest (node env, timeout 15s)        |
| `npm run lint`        | ESLint                                |
| `npm run format`      | Prettier --write                      |
| `npm run typecheck`   | tsc node + web                        |
| `npm run seed:mock`   | Seeds SQLite con datos mock (Neuquén) |
| `npm run generate:nsh-key` | Genera build/key.nsh desde .env     |
| `npm run build:win`   | Build NSIS installer (incluye generate:nsh-key) |
| `npm run build:mac`   | Build DMG                             |
| `npm run build:linux` | Build AppImage/snap/deb               |

---

## Arquitectura del Software

### Visión General (3-capas)

```
┌─────────────────────────────────────────────────────┐
│               RENDERER (React 19)                    │
│  App.tsx → ProductionShell / DebugPanel              │
│    ├── MapView (Leaflet + react-leaflet)             │
│    ├── DevicesPanel (NBM-550, GPS)                   │
│    ├── SessionsPanel (historial, export)             │
│    └── Hooks (useDevices, useSession, ...)           │
├─────────────────────────────────────────────────────┤
│                PRELOAD (contextBridge)               │
│         window.api = { devices, session, ... }       │
│         ipcRenderer.invoke / ipcRenderer.on          │
├─────────────────────────────────────────────────────┤
│              MAIN PROCESS (Electron)                 │
│  index.ts → ServiceFactory → Services                │
│    ├── DeviceManager (drivers + polling)             │
│    ├── GeoFusionService (GPS + EMF fusion)           │
│    ├── SessionService (ciclo de sesión)              │
│    ├── SQLiteSessionRepository (persistencia)        │
│    ├── TileCacheService (tiles offline)              │
│    └── IPC Handlers (canales request/response)       │
└─────────────────────────────────────────────────────┘
```

### Capa Main (Node.js)

#### Entry Point — `src/main/index.ts`

Secuencia de inicialización:

1. **Registra esquema de protocolo** `tile-cache://` (tiles offline)
2. **Inicializa `TileCacheService`** — prepara directorio de caché
3. **Registra protocolo** en la sesión de Electron
4. **Crea servicios** via `ServiceFactory.createServices()` — factory con inyección manual de dependencias
5. **Crea ventana** `BrowserWindow` con preload
6. **Configura IPC handlers** — conecta DeviceManager, SessionService y TileCache con el renderer
7. **Inicializa DeviceManager** — escanea puertos serie, detecta y conecta GPS + NBM-550
8. **Wirea SessionService** — pasa referencias de drivers NBM y GPS post-inicialización

#### Service Factory — `src/main/factories/ServiceFactory.ts`

Patrón **Factory Method** manual (sin frameworks de DI). Red de dependencias:

```
SerialPortScanner (o simulado si NIR_SIMULATION=true o --simulation)
    → DeviceManager(scanner)
    → SessionService(geoFusion, sessionRepository)
GeoFusionService (independiente)
SQLiteSessionRepository (independiente)
```

El wiring de drivers a SessionService ocurre en **dos fases**: creación de servicios → post-inicialización de DeviceManager. Un listener en `device:status` re-wirea automáticamente tras reconexiones.

#### Device Drivers

**GPSDriver** (`src/main/devices/gps/GPSDriver.ts`)

- Protocolo **NMEA 0183** a 4800 baud
- `ReadlineParser` con delimitador `\r\n`
- Parseo con `nmea-simple` (sentencias GGA, RMC, GSA)
- Emite eventos: `position` (lat/lon/alt/hdop), `nmea` (línea cruda), `fix-lost`
- Mantiene estado interno de posición y validez de fix

**NBM550Driver** (`src/main/devices/nbm550/NBM550Driver.ts`)

- Protocolo **binario comando-respuesta** a 460800 baud, delimitador `;`
- **Cola de promesas serializada** — garantiza un solo comando pendiente por vez
- Timeout por comando: 6s. Tras **4 timeouts consecutivos** → estado `error`
- Comandos: `REMOTE ON`, `RESET MAX`, `RESET MAX?`, `READ?`, `BAT?`, `INFO?`
- Parser dedicado (`NBM550Parser.ts`) que extrae RSS, unidad y batería

**Simuladores** (`src/main/devices/simulated/`)

- `SimulatedGPSDriver`: emite posiciones falsas sobre Av. del Libertador (CABA) cada 3s
- `SimulatedNBM550Driver`: emite lecturas senoidales con ruido aleatorio
- Activados con `NIR_SIMULATION=true` o flag `--simulation`

#### Servicios Core

**DeviceManager** (`src/main/services/DeviceManager.ts`)

- Orquestador de drivers. Ciclo de vida de NBM-550 y GPS.
- `initialize()` → carga `port-config.json` → `scan()` → auto-detecta y conecta
- `ReconnectController` por dispositivo: 3s entre reintentos, timeout de 30s
- `NBMPollingController`: sondea NBM cada **200ms** (5s en simulación). Batería cada 5 ciclos.
- Emite eventos: `device:status`, `device:error`, `gps:position`, `gps:nmea`, `nbm:sample`, `state`

**GeoFusionService** (`src/main/services/GeoFusionService.ts`)

- Fusiona posición GPS + medición EMF en un `GeoTimestamp`.
- Dos modos de captura:
  - **`distance`** — captura al moverse ≥ N metros (Haversine)
  - **`time`** — captura cada N ms
- Aplica **correction factor**: `correctedMeasurement = rawMeasurement × factor`
- Secuencia de captura: GPS → NBM → reset max hold → emite `point`
- Flag `capturing` previene doble captura simultánea

**SessionService** (`src/main/services/SessionService.ts`)

- Ciclo de vida: `idle → running → stopped`
- `start()`: valida dispositivos conectados + fix GPS → resuelve correction factor desde datos embebidos → inicia fusión
- `stop()`: detiene fusión → finaliza en repositorio (actualiza metadatos, computa stats, flush)
- Persiste puntos **incrementalmente** via `ISessionRepository`
- **Validación crítica**: sin correction factor para la sonda → la sesión **no arranca**

#### Persistencia — SQLiteSessionRepository

Motor: **sql.js** (SQLite WASM). Base **cifrada con AES-256-GCM** (clave via `NIR_DB_ENCRYPTION_KEY`).

**Esquema — 3 tablas:**

```sql
sessions (id TEXT PK, label, startedAt, stoppedAt, sampleCount,
          correctionFactor, instrument JSON, provincia, localidad,
          apellido1, apellido2)

geo_points (id TEXT PK, sessionId, sequenceNumber,
            timestamp, lat, lon, alt, rawMeasurement,
            correctedMeasurement, unit)

session_stats (sessionId PK, avgCorrected, maxCorrected,
               minCorrected, pointCount)
```

**Flujo incremental:** `initSession()` → `addPoint()` × N → `finalizeSession()`. Flush cada 10 puntos o 30s.

**Límite de exportación:** Toda exportación (GeoJSON, CSV, XLSX, KMZ) se trunca a `MAX_EXPORT_POINTS = 5000` puntos por sesión.

#### Canales IPC — `src/main/ipc/`

30+ canales definidos en `channels.ts`. Separación por handler:

| Handler                    | Canales                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `DeviceManagerHandler.ts`  | `device:list`, `device:scan`, `device:set-port`, `device:connect`, `device:disconnect`                                          |
| `SessionServiceHandler.ts` | `session:start/stop/list/get/delete`, `session:export-*`, `session:import-geojson`, `session:stats`, `session:points-in-bounds` |
| `TileCacheHandler.ts`      | `tile:cache-stats`, `tile:clear-cache`, `tile:preload`, `tile:preload-cancel`, `tile:import`                                    |

**Push** (Main → Renderer): `gps:position`, `nbm:sample`, `session:sample`, `device:status`
**Request/Response** (Renderer → Main): `device:list`, `session:start`, `session:export`

#### Factor de Corrección / Incertidumbre

Los factores de corrección para sondas Narda están **embebidos** en `resources/probe-data.json`:

| Sonda  | Rango (MHz) | Incertidumbre (%) | Factor |
| ------ | ----------- | ----------------- | ------ |
| EF0391 | 0.1 – 3000  | 2.73              | 1.370  |
| EF1891 | 3 – 18000   | 3.12              | 1.432  |
| EF6091 | 100 – 6000  | 4.05              | 1.594  |
| EF6092 | 0.1 – 3000  | 4.10              | 1.604  |
| HF3061 | 0.3 – 30    | 1.11              | 1.000  |
| HF0191 | 27 – 1000   | 1.27              | 1.000  |

`loadBuiltInData.ts` carga estos datos según empaquetado (development vs producción). El factor se resuelve automáticamente por modelo de sonda. Sin factor válido → la sesión no arranca.

### Capa Preload — `src/preload/index.ts`

Expone **`window.api`** via `contextBridge.exposeInMainWorld`:

| Sección     | Métodos                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ports`     | `list()`                                                                                                                           |
| `devices`   | `list()`, `scan()`, `setPort()`, `connect()`, `disconnect()` + listeners                                                           |
| `gps`       | `onPosition()`, `onNmea()`, `onFixLost()`                                                                                          |
| `nbm`       | `onSample()`                                                                                                                       |
| `session`   | `start()`, `stop()`, `list()`, `get()`, `delete()`, `export()`, `importGeoJSON()`, `getStats()`, `getPointsInBounds()` + listeners |
| `settings`  | `getProbeInfo()`, `getActiveUncertainty()`                                                                                         |
| `tileCache` | `getStats()`, `clearCache()`, `preloadTiles()`, `cancelPreload()`, `importTiles()` + progress listeners                            |

### Capa Renderer (React 19)

#### App.tsx

Renderiza condicionalmente según `?debug=1`:

- **DebugPanel** — herramientas de desarrollo
- **ProductionShell** — interfaz de producción

#### ProductionShell — Orquestador de UI

Gestiona 3 pestañas laterales (Dispositivos | Historial | Configuración), MapView con Leaflet, PointsTable y AllSessionsDrawer. Coordina hooks: `useDevices`, `useSession`, `useMultipleSessions`, `usePersistentSessions`.

##### Portrait / Hybrid Layout

En **modo vertical** (`orientation: portrait`) el layout cambia automáticamente a un esquema híbrido:

```
┌──────────────────────────────────┐
│ [Dispositivos] [Historial] [⚙]  │ ← barra tabs compacta
├──────────────────────────────────┤
│ ┌─ panel-content (dropdown) ──┐  │ ← se abre al tocar un tab,
│ │ GPS: Connected    [▶]       │  │    se cierra al mismo tab
│ │ NBM: Connected              │  │    o tocando fuera (backdrop)
│ │ [Modo Time] [10s]           │  │
│ └─────────────────────────────┘  │
│            M A P                 │ ← ancho completo
├──────────────────────────────────┤
│ Puntos (32)                [▼]  │ ← tabla colapsable
└──────────────────────────────────┘
```

- La sidebar se convierte en una **barra delgada de tabs** en la parte superior
- El contenido del tab activo se despliega como **dropdown overlay**
- El mapa ocupa el **ancho completo** con padding reducido
- La tabla de puntos es un **acordeón colapsable** (▼/▲)
- Los controles de tamaño de fuente, info de dispositivos y session-ID se ocultan en vertical
- Un **backdrop transparente** cierra el panel al tocar fuera
- La detección de orientación es en **tiempo real** via `matchMedia`; al rotar a landscape se restaura el layout original sin cambios

#### Hooks Principales

| Hook                    | Propósito                                                  |
| ----------------------- | ---------------------------------------------------------- |
| `useDevices`            | Estado y control de NBM-550 y GPS via IPC                  |
| `useSession`            | Ciclo de sesión: start/stop/reset, puntos en vivo, resumen |
| `useGeoData`            | Prepara datos geográficos para el mapa                     |
| `useGpsPosition`        | Posición GPS actual (contexto React con Provider)          |
| `useMultipleSessions`   | Carga múltiples sesiones históricas superpuestas           |
| `usePersistentSessions` | CRUD de sesiones guardadas + export                        |
| `useTileProvider`       | Selección de tiles (OSM, CartoDB, ESRI)                    |
| `useTileCache`          | Estadísticas y control del caché offline                   |

#### MapView

Leaflet map con:

- `CircleMarker` por punto (color según intensidad via paleta verde-amarillo-rojo)
- `Polyline` entre puntos (segmentos color-coded)
- `GpsPositionProvider` para seguir posición actual
- Soporte multi-sesión (sesiones históricas superpuestas)
- 5 proveedores de tiles: OpenStreetMap, OSM Humanitarian, CartoDB Positron, CartoDB Dark Matter, ESRI Satélite
- Caché offline via protocolo `tile-cache://`

### Patrones de Diseño

| Patrón             | Aplicación                                          |
| ------------------ | --------------------------------------------------- |
| **EventEmitter**   | Comunicación asíncrona intra-Main                   |
| **Factory Method** | `ServiceFactory.createServices()` con DI manual     |
| **Strategy**       | `GeoFusionConfig.triggerMode`: distance vs time     |
| **Repository**     | `ISessionRepository` (SQLiteSessionRepository)      |
| **Bridge**         | `contextBridge` en preload                          |
| **Observer**       | Event listeners: `device:status`, `session:point`   |
| **Promise Queue**  | NBM550Driver serializa comandos                     |
| **DTO**            | `src/shared/dto/` desacopla IPC de implementaciones |

---

## Export Formats

| Formato                | Descripción                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **GeoJSON** (RFC 7946) | FeatureCollection con Point [lon, lat, alt]. Incluye metadata de sesión, instrumento, stats. Cifrado (.geojson.enc). |
| **CSV**                | Quoted comma-separated. Cabecera en español.                                                                         |
| **XLSX**               | 3 archivos via exceljs usando plantillas ENACOM: reporte (16 cols), reporte_p (% MEP), averif (solo MEP ≥ 50%).      |
| **KMZ**                | KML comprimido para Google Earth. Color-coded por % MEP. Puntos + segmentos + timestamps.                            |

## Database Encryption

La base de datos SQLite (`sessions.db`) y los archivos GeoJSON exportados se cifran con
**AES-256-GCM** (clave derivada via SHA-256).

### Desarrollo

```ini
# .env (gitignored, en la raíz del proyecto)
NIR_DB_ENCRYPTION_KEY=passphrase-compartida-entre-equipos
```

### Producción (Windows)

El instalador NSIS escribe `NIR_DB_ENCRYPTION_KEY` en el registro del sistema a nivel de máquina.
La aplicación la lee de `process.env` en tiempo de ejecución.

La variable se setea durante la instalación y se elimina al desinstalar la aplicación.

### Variables de Entorno

| Variable                | Requerida | Descripción                                    |
| ----------------------- | --------- | ---------------------------------------------- |
| `NIR_DB_ENCRYPTION_KEY` | Sí        | Passphrase compartida (cualquier string)       |
| `NIR_SIMULATION`        | No        | `true` para activar simulación de dispositivos |

### Migración Legacy

Bases existentes sin cifrar se detectan automáticamente y migran en el primer guardado.

---

## Créditos

Ver [AUTHORS.md](./AUTHORS.md).

## Licencia

Este software es propiedad exclusiva del Ente Nacional de Comunicaciones (ENACOM). Ver [LICENSE](./LICENSE).
