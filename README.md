# RNI Monitor

![Version](https://img.shields.io/badge/version-0.18.0-blue.svg)

**Mapeador de Radiaciones No Ionizantes** — Aplicación de escritorio para relevar y mapear mediciones de campo electromagnético basada en la **Recomendación ITU-T K.113**.

Desarrollado por el [Ente Nacional de Comunicaciones (ENACOM)](https://www.enacom.gob.ar), organismo regulador de comunicaciones de la República Argentina.

---

## Overview

`RNI Monitor` se conecta a un **Narda NBM-550** (medidor de campo eléctrico de banda ancha) por USB o cable óptico, y a un **receptor GPS** —NMEA 0183 por puerto serie o **Garmin 18x por USB**— para capturar lecturas georreferenciadas de radiación no ionizante. Los datos se visualizan en tiempo real sobre un mapa interactivo, se almacenan localmente en una base de datos SQLite cifrada y pueden exportarse en múltiples formatos normalizados.

## Features

- **Gestión de dispositivos** — Detección del Garmin 18x USB y escaneo automático de puertos serie, conexión/desconexión de NBM-550 y GPS, reconexión automática ante desconexión inesperada.
- **Dos vías de GPS** — Receptor NMEA 0183 por puerto serie o **Garmin 18x por USB nativo** (protocolo Garmin, paquetes PVT).
- **NBM-550 por USB o cable óptico** — Selector de tipo de conexión que ajusta el baud rate (460800 USB / 115200 óptico).
- **Captura en tiempo real** — Sondeo del NBM-550 cada 200 ms con fusión de posición GPS mediante trigger por distancia (Haversine) o por tiempo.
- **Mapa interactivo** — Visualización de puntos de medición sobre Leaflet con marcadores color-coded (verde → rojo según % MEP), polilíneas de recorrido, indicador de rumbo sobre la posición actual y tramos grises donde se perdió el fix GPS.
- **Gestión de sesiones** — Inicio y finalización de sesiones con metadatos de ubicación (provincia y localidad según dataset INDEC, apellidos de los agentes). Carga y comparación de sesiones históricas, e importación de sesiones exportadas.
- **Factores de corrección** — Factores de incertidumbre embebidos para sondas Narda (EF0391, EF1891, EF6091, EF6092, HF3061, HF0191) aplicados automáticamente.
- **Modo simulación** — El instalador crea un acceso directo dedicado `RNI Monitor (DEMO)` con flag `--simulation`. También se puede activar con `NIR_SIMULATION=true` para desarrollo y testing sin hardware físico.
- **Exportación multi-formato** — GeoJSON (cifrado), XLSX (tres archivos con plantillas ENACOM) y KMZ (Google Earth).
- **Caché de tiles offline** — Precarga por área, importación de tiles desde disco y almacenamiento local para operación sin conexión.
- **Base de datos cifrada** — SQLite con AES-256-GCM, protección contra manipulación externa.
- **Alertas y calibración** — Sonidos configurables ante desconexión de equipos y pérdida/recuperación de fix GPS, y control de vencimiento de calibración del instrumento (validez 24 meses).
- **Drivers embebidos** — FTDI, Prolific y Zadig empaquetados en el instalador, con detección e instalación desde la propia app.
- **Manual y diagnóstico integrados** — Manual de usuario en ventana propia, historial de cambios in-app y exportación de logs desde Configuración.

## Tech Stack

| Capa               | Tecnología                                  |
| ------------------ | ------------------------------------------- |
| Shell desktop      | Electron 42 + electron-vite 5 + Vite 7      |
| Frontend           | React 19 + TypeScript 5.9 (strict)          |
| Mapas              | Leaflet 1.9 + react-leaflet 5               |
| Comunicación serie | serialport 13                               |
| GPS USB nativo     | usb (node-usb) 2.18                         |
| Parsing GPS        | nmea-simple 3.3                             |
| Base de datos      | sql.js (SQLite WASM)                        |
| Exportación        | exceljs 4.4, archiver 7.0                   |
| Testing            | Vitest 4.1 + coverage V8                    |
| Empaquetado        | electron-builder 26 (NSIS / DMG / AppImage) |
| Utilidades         | dotenv, uuid, adm-zip                       |

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

El instalador crea dos accesos directos en el escritorio y menú Inicio: **RNI Monitor** (modo normal) y **RNI Monitor (DEMO)** (modo simulación con `--simulation`).

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

| Comando                    | Propósito                                       |
| -------------------------- | ----------------------------------------------- |
| `npm run dev`              | Dev con hot reload                              |
| `npm run build`            | Typecheck + build production                    |
| `npm test`                 | Vitest (node env, timeout 15s)                  |
| `npm run test:watch`       | Vitest en modo watch                            |
| `npm run test:coverage`    | Vitest con reporte de cobertura V8              |
| `npm run test:fusion`      | Script de prueba de fusión GPS + NBM            |
| `npm run test:garmin`      | Diagnóstico E2E del Garmin 18x USB              |
| `npm run lint`             | ESLint                                          |
| `npm run format`           | Prettier --write                                |
| `npm run typecheck`        | tsc node + web                                  |
| `npm run start`            | Preview del build de producción                 |
| `npm run build:unpack`     | Build sin instalador (carpeta --dir)            |
| `npm run changelog`        | Genera CHANGELOG.md desde los commits           |
| `npm run generate:nsh-key` | Genera build/key.nsh desde .env                 |
| `npm run build:win`        | Build NSIS installer (incluye generate:nsh-key) |
| `npm run build:mac`        | Build DMG                                       |
| `npm run build:linux`      | Build AppImage/snap/deb                         |

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
│    ├── SessionSupervisor (watchdog de sesión)        │
│    ├── TileCacheService (tiles offline)              │
│    ├── EventBus (push tipado + log de alertas)       │
│    └── IPC Handlers (canales request/response)       │
└─────────────────────────────────────────────────────┘
```

### Capa Main (Node.js)

#### Entry Point — `src/main/index.ts`

Secuencia de inicialización:

1. **Inicializa el log de archivo** (`setupLogService`) y, en producción, valida que exista `NIR_DB_ENCRYPTION_KEY` — si falta, muestra un diálogo de error y cierra la app
2. **Registra esquema de protocolo** `tile-cache://` (tiles offline)
3. **Inicializa `TileCacheService`** — prepara el directorio de caché y registra el protocolo en la sesión de Electron
4. **Crea servicios** via `ServiceFactory.createServices()` — factory con inyección manual de dependencias
5. **Crea el `EventBus`** con un `AlertLogger` (log de alertas en `userData`) y lo asocia a la ventana
6. **Crea ventana** `BrowserWindow` con preload — se abre maximizada y, cuando está empaquetada, sin menú y con devtools deshabilitadas
7. **Configura IPC handlers** — conecta DeviceManager, SessionService, exportadores, settings, drivers, Zadig, manual, logs y TileCache con el renderer
8. **Inicializa DeviceManager** — detecta el Garmin USB, escanea puertos serie y conecta GPS + NBM-550
9. **Wirea la sesión** (`setupSessionWiring`) — crea el `SessionSupervisor`, que sincroniza el polling con el estado de la sesión y supervisa desconexiones

Al salir (`before-quit`) detiene la sesión activa si la hay y desconecta todos los dispositivos antes de cerrar.

#### Service Factory — `src/main/factories/ServiceFactory.ts`

Patrón **Factory Method** manual (sin frameworks de DI). Red de dependencias:

```
ConfigService (modo simulación, configs, puertos persistidos)
SerialPortScanner (o simulado si NIR_SIMULATION=true o --simulation)
    → DeviceManager(scanner, driverFactory, config)
CryptoService → SQLiteSessionRepository(flush, crypto)
GeoFusionService + CorrectionFactorResolver(ProbeDataService)
    → SessionService(geoFusion, sessionRepository, config, correctionResolver)
ExportOrchestrator(sessionRepository, { geojson, kmz, xlsx })
```

El wiring de drivers a SessionService ocurre en **dos fases**: creación de servicios → post-inicialización de DeviceManager. La segunda fase la ejecuta `setupSessionWiring()`, que instancia el `SessionSupervisor`; un listener en `device:status` re-wirea automáticamente tras reconexiones.

#### Device Drivers

**GPSDriver** (`src/main/devices/gps/GPSDriver.ts`)

- Protocolo **NMEA 0183** a 4800 baud
- `ReadlineParser` con delimitador `\r\n`
- Parseo con `nmea-simple` (sentencias GGA, RMC, GSA)
- Emite eventos: `position` (lat/lon/alt/hdop), `nmea` (línea cruda), `fix-lost`
- Mantiene estado interno de posición y validez de fix

**NBM550Driver** (`src/main/devices/nbm550/NBM550Driver.ts`)

- Protocolo **binario comando-respuesta**, delimitador `;`. Baud según el tipo de conexión: **460800** por USB, **115200** por cable óptico (`nbmBaudRateFor()` en `config.constants.ts`)
- **Cola de promesas serializada** — garantiza un solo comando pendiente por vez
- Timeout por comando: 6s. Tras **4 timeouts consecutivos** → estado `error`
- Comandos: `REMOTE ON`, `RESET MAX`, `RESET MAX?`, `READ?`, `BAT?`, `INFO?`
- Parser dedicado (`NBM550Parser.ts`) que extrae RSS, unidad y batería

**GarminUSBDriver** (`src/main/devices/gps/garmin/GarminUSBDriver.ts`)

- GPS **Garmin 18x por USB nativo** (node-usb), sin puerto serie de por medio
- `GarminUsbDetector` reporta dos cosas: si el receptor está **presente** y si es **accesible** (requiere el driver WinUSB)
- `GarminUSBProtocol` arma y parsea el framing Garmin; los paquetes **PVT** se traducen a `GeoPosition` en `pvtToGeoPosition.ts`
- Lee desde el **endpoint interrupt IN** y libera la interfaz al desconectar
- Se expone como el pseudo-puerto `garmin-usb`, que el scanner prioriza por sobre los puertos serie
- Si está presente pero sin WinUSB, el estado publica `garminWinusbMissing` y la UI ofrece configurarlo con Zadig

**Simuladores** (`src/main/devices/simulated/`)

- `SimulatedGPSDriver`: emite posiciones falsas alrededor del Obelisco (CABA) cada 3s
- `SimulatedNBM550Driver`: emite lecturas senoidales con ruido aleatorio
- Activados con `NIR_SIMULATION=true` o flag `--simulation`

#### Servicios Core

**DeviceManager** (`src/main/services/DeviceManager.ts`)

- Orquestador de drivers. Ciclo de vida de NBM-550 y GPS.
- `initialize()` → carga `port-config.json` (en `userData`) → detecta Garmin USB → `scan()` → auto-detecta y conecta
- `ReconnectController` por dispositivo: 3s entre reintentos, timeout de 30s
- `NBMPollingController`: dos modos. En **active** sondea el NBM cada **200 ms** (5 s en simulación); en **standby** no mide. La batería se lee por timer propio cada **30 s** y tras **8 lecturas fallidas** consecutivas corta el polling.
- Emite eventos: `device:status`, `device:error`, `gps:position`, `gps:nmea`, `gps:fix-lost`, `nbm:sample`, `nbm:battery`, `nbm:mode`, `state`. El estado publicado incluye `garminWinusbMissing` para el aviso de driver.

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

**SessionSupervisor** (`src/main/services/SessionSupervisor.ts`)

- Conecta `DeviceManager` con `SessionService` y supervisa el ciclo de la sesión
- Sincroniza el polling del NBM con el estado de la sesión (active ↔ standby)
- **Watchdog**: si el NBM se desconecta durante una sesión activa y no reconecta en **30 s**, la sesión se detiene automáticamente
- Re-wirea los drivers en `SessionService` después de cada reconexión

#### Persistencia — SQLiteSessionRepository

Motor: **sql.js** (SQLite WASM). Base **cifrada con AES-256-GCM** (clave via `NIR_DB_ENCRYPTION_KEY`).

**Esquema — 3 tablas:**

```sql
sessions (id TEXT PK, label, startedAt, stoppedAt, sampleCount,
          correctionFactor, instrument JSON, provincia, localidad,
          apellido1, apellido2, createdAt)

geo_points (id TEXT PK, sessionId, sequenceNumber,
            timestamp, lat, lon, alt, rawMeasurement,
            correctedMeasurement, unit, gps_gap)

session_stats (sessionId PK, avgCorrected, maxCorrected,
               minCorrected, pointCount, computedAt)

-- Índices
idx_geo_session_id (sessionId)
idx_geo_timestamp (timestamp)
idx_geo_lat_lon (lat, lon)
```

El esquema y los mapeos de filas viven aparte, en `src/main/db/` (`SchemaManager.ts` aplica tablas, índices y los `ALTER TABLE` idempotentes de las columnas agregadas después del release inicial; `rowMappers.ts` traduce filas ↔ DTOs).

**Flujo incremental:** `initSession()` → `addPoint()` × N → `finalizeSession()`. Flush cada **5 puntos o 5 s** (`DEFAULT_FLUSH` en `src/shared/config.constants.ts`).

**Límite de exportación:** Toda exportación (GeoJSON, XLSX, KMZ) se trunca a `MAX_EXPORT_POINTS = 5000` puntos por sesión.

#### Canales IPC — `src/main/ipc/`

17 eventos push y 38 canales request/response, definidos en `src/shared/ipc-channels.ts` (`IPC_EVENTS` / `IPC_HANDLERS`). Separación por handler:

| Handler                    | Canales                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DeviceManagerHandler.ts`  | `device:list`, `device:scan`, `device:set-port`, `device:connect`, `device:disconnect`                                                                                                                                                      |
| `SessionServiceHandler.ts` | `session:start/stop/list/get/delete`, `session:export-*`, `session:import-geojson`, `session:stats`, `session:points-in-bounds`                                                                                                             |
| `TileCacheHandler.ts`      | `tile:cache-stats`, `tile:clear-cache`, `tile:preload`, `tile:preload-cancel`, `tile:import`                                                                                                                                                |
| `SettingsHandler.ts`       | `settings:get-probe-info`, `settings:get-device-info`, `settings:get-active-uncertainty`, `settings:get-built-in-probe-data`, `settings:get/set-sounds-enabled`, `settings:get/set-nbm-connection-type`, `app:get-version`, `app:changelog` |
| `DriverHandler.ts`         | `drivers:check`, `drivers:install`                                                                                                                                                                                                          |
| `ZadigHandler.ts`          | `zadig:open`                                                                                                                                                                                                                                |
| `ManualHandler.ts`         | `manual:open-section`                                                                                                                                                                                                                       |
| `PortsHandler.ts`          | `ports:list` — agrega el pseudo-puerto `garmin-usb` cuando el receptor está presente                                                                                                                                                        |
| `LogsHandler.ts`           | `logs:get-path`, `logs:export`                                                                                                                                                                                                              |

**Push** (Main → Renderer): `gps:position`, `gps:nmea`, `gps:fix-lost`, `nbm:sample`, `nbm:battery`, `nbm:mode`, `device:status`, `device:error`, `scan:state`, `session:sample`, `session:started`, `session:stopped`, `session:alert`, `alert`, `tile:preload-progress`, `tile:import-progress`

**Request/Response** (Renderer → Main): `device:*`, `session:*`, `ports:list`, `settings:*`, `tile:*`, `drivers:*`, `zadig:open`, `manual:open-section`, `app:*`, `logs:*`

Todos los eventos push salen por el `EventBus` tipado (`src/main/services/EventBus.ts`), que además persiste las alertas vía `AlertLogger`.

#### Factor de Corrección / Incertidumbre

Los factores de corrección para sondas Narda están **embebidos** en `resources/probe-data.json`, que es la **fuente de verdad** (la tabla de abajo es solo referencia y puede quedar desactualizada):

| Sonda  | Rango (MHz) | Incertidumbre (%) | Factor |
| ------ | ----------- | ----------------- | ------ |
| EF0391 | 0.1 – 3000  | 2.73              | 1.370  |
| EF1891 | 3 – 18000   | 3.12              | 1.432  |
| EF6091 | 100 – 6000  | 4.05              | 1.594  |
| EF6092 | 0.1 – 3000  | 4.10              | 1.604  |
| HF3061 | 0.3 – 30    | 1.11              | 1.000  |
| HF0191 | 27 – 1000   | 1.27              | 1.000  |

`loadBuiltInData.ts` carga estos datos según empaquetado (development vs producción). El factor se resuelve automáticamente por modelo de sonda. Sin factor válido → la sesión no arranca.

#### Drivers de Windows y Zadig

- `DriverDetector` / `DriverInstaller` (`src/main/drivers/`) verifican e instalan los drivers **FTDI** y **Prolific** de los conversores USB-serie. Canales `drivers:check` y `drivers:install`.
- Los drivers viajan con la app: `resources/drivers/` se empaqueta como `extraResources`.
- El **Garmin 18x USB** necesita el driver **WinUSB**. Se empaqueta **Zadig 2.9** y se abre desde el banner de advertencia del panel de dispositivos (`zadig:open`), que además enlaza la sección §4.3 del manual.

#### Manual de usuario integrado

- `docs/manual.html` se empaqueta como `manual.html` (extraResources) y se abre en una **ventana Electron propia** (`src/main/manual/ManualWindow.ts`) en vez del navegador externo, para que funcione el salto por ancla.
- Canal `manual:open-section` — la UI puede abrirlo directamente en una sección (por ejemplo `section-4-3`).

#### Logs y diagnóstico

- `setupLogService()` (`src/main/infrastructure/LogService.ts`) redirige la consola del proceso main a un archivo de log en `userData`.
- `AlertLogger` persiste las alertas que emite el `EventBus`.
- Canales `logs:get-path` y `logs:export` — el botón **Exportar logs** de Configuración deja una copia en el Escritorio.
- `app:changelog` sirve el `CHANGELOG.md` empaquetado para el visor **Ver novedades**.

#### Configuración persistida — ConfigService

Dos archivos JSON en `userData`:

| Archivo            | Contenido                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `app-config.json`  | Preferencias del usuario: tipo de conexión del NBM (`usb` / `optical`), sonidos de alerta |
| `port-config.json` | Últimos puertos asignados a NBM-550 y GPS, para reconectar sin volver a escanear todo     |

Además expone `simulationMode` y centraliza los valores por defecto de drivers, polling, timeouts, reconexión, flush y fusión, que viven en `src/shared/config.constants.ts`.

#### Alertas y control de calibración

- **Sonidos de alerta** (`SoundManager` en el renderer) ante desconexión de equipos y pérdida/recuperación del fix GPS. Se habilitan o deshabilitan desde Configuración (`settings:get/set-sounds-enabled`).
- `calibrationCheck.ts` evalúa la fecha de calibración leída del instrumento (`DEVICE_INFO?`): validez **24 meses**, aviso **30 días** antes del vencimiento. Estados: `valid`, `expiring`, `expired`, `unknown`.

### Capa Preload — `src/preload/index.ts`

Expone **`window.api`** via `contextBridge.exposeInMainWorld`:

| Sección     | Métodos                                                                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ports`     | `list()`                                                                                                                                                                                           |
| `devices`   | `list()`, `scan()`, `setPort()`, `connect()`, `disconnect()`, `onStatus()`, `onError()`, `onScanState()`                                                                                           |
| `gps`       | `onPosition()`, `onNmea()`, `onFixLost()`                                                                                                                                                          |
| `nbm`       | `onSample()`, `onBattery()`, `onMode()`                                                                                                                                                            |
| `session`   | `start()`, `stop()`, `list()`, `get()`, `delete()`, `export()`, `exportGeoJSON()`, `importGeoJSON()`, `getStats()`, `getPointsInBounds()`, `onSample()`, `onStarted()`, `onStopped()`, `onAlert()` |
| `settings`  | `getProbeInfo()`, `getDeviceInfo()`, `getActiveUncertainty()`, `getBuiltInProbeData()`, `getSoundsEnabled()`, `setSoundsEnabled()`, `getNbmConnectionType()`, `setNbmConnectionType()`             |
| `tileCache` | `getStats()`, `clearCache()`, `preloadTiles()`, `cancelPreload()`, `importTiles()`, `onPreloadProgress()`, `onImportProgress()`                                                                    |
| `drivers`   | `check()`, `install()`                                                                                                                                                                             |
| `zadig`     | `open()`                                                                                                                                                                                           |
| `manual`    | `openSection()`                                                                                                                                                                                    |
| `app`       | `getVersion()`, `getChangelog()`                                                                                                                                                                   |
| `logs`      | `getPath()`, `export()`                                                                                                                                                                            |

### Capa Renderer (React 19)

#### App.tsx

Renderiza condicionalmente según `?debug=1`:

- **DebugPanel** — herramientas de desarrollo
- **ProductionShell** — interfaz de producción

Todo el árbol va envuelto en `ErrorBoundary` y `ToastProvider` (sistema global de toasts), y el título de la ventana se setea con la versión de la app (`app:get-version`).

#### ProductionShell — Orquestador de UI

Gestiona 3 pestañas laterales (Dispositivos | Historial | Configuración), MapView con Leaflet, PointsTable y AllSessionsDrawer. Coordina hooks: `useDevices`, `useSession`, `useMultipleSessions`, `usePersistentSessions`.

##### Portrait / Hybrid Layout

En **modo vertical** (`orientation: portrait`) la interfaz pasa a un esquema híbrido: la sidebar se convierte en una barra de tabs arriba, el contenido del tab activo se despliega como dropdown sobre el mapa, el mapa toma el ancho completo y la tabla de puntos queda como acordeón colapsable. La detección es en tiempo real vía `matchMedia` y al rotar a landscape se restaura el layout original. Diagrama y detalle en [docs/layout-portrait.md](./docs/layout-portrait.md).

#### Hooks Principales

| Hook                    | Propósito                                                   |
| ----------------------- | ----------------------------------------------------------- |
| `useDevices`            | Estado y control de NBM-550 y GPS via IPC                   |
| `useSession`            | Ciclo de sesión: start/stop/reset, puntos en vivo, resumen  |
| `useGeoData`            | Prepara datos geográficos para el mapa                      |
| `useGpsPosition`        | Posición GPS actual (contexto React con Provider)           |
| `useMultipleSessions`   | Carga múltiples sesiones históricas superpuestas            |
| `usePersistentSessions` | CRUD de sesiones guardadas + export                         |
| `useTileProvider`       | Selección de tiles (OSM, CartoDB, ESRI)                     |
| `useTileCache`          | Estadísticas y control del caché offline                    |
| `useDriverCheck`        | Chequeo de drivers FTDI/Prolific e instalación desde la app |
| `useTheme`              | Tema de la interfaz (oscuro / soft)                         |

#### MapView

Leaflet map con:

- `CircleMarker` por punto (color según intensidad via paleta ITU-T K.113 de 10 niveles: azul → verde → amarillo → naranja → rojo)
- `Polyline` entre puntos (segmentos color-coded)
- `GpsPositionProvider` para seguir posición actual
- Soporte multi-sesión (sesiones históricas superpuestas)
- 5 proveedores de tiles: OpenStreetMap, OSM Humanitarian, CartoDB Positron, CartoDB Dark Matter, ESRI Satélite
- Caché offline via protocolo `tile-cache://`
- `HeadingMarker`: flecha de rumbo sobre la posición actual (se muestra con velocidad > 1 km/h)
- Tramos en gris donde la sesión registró pérdida de fix GPS (`gpsGap`)
- Controles propios de pan y maximizado, y rectángulo de selección de área para precargar tiles
- Interacción bidireccional con la tabla de puntos (click en el punto ↔ scroll a la fila)

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

| Formato                | Descripción                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **GeoJSON** (RFC 7946) | FeatureCollection con Point [lon, lat, alt]. Incluye metadata de sesión, instrumento, stats. Cifrado (.geojson.enc).                                                     |
| **XLSX**               | 3 archivos via exceljs usando plantillas ENACOM: reporte (16 cols), reporte_p (% MEP), averif (solo MEP ≥ 50%).                                                          |
| **KMZ**                | KML comprimido para Google Earth. Color-coded por % MEP (paleta ITU-T K.113). Puntos + segmentos + timestamps. Embebe paleta de colores e icono de la app como overlays. |

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

## Pendientes

- **Auto-update — no implementado.** `electron-updater` figura en las dependencias y existe `dev-app-update.yml`, pero no hay ningún `autoUpdater` cableado en el código. Además `electron-builder.yml` publica a una URL placeholder (`https://example.com/auto-updates`), que hay que reemplazar por el endpoint real antes de habilitarlo.

## Créditos

Ver [AUTHORS.md](./AUTHORS.md).

## Licencia

Este software es propiedad exclusiva del Ente Nacional de Comunicaciones (ENACOM). Ver [LICENSE](./LICENSE).
