# RNI Monitor

Desktop EMF mapper basado en ITU-T K.113. Electron 42 + React 19 + Leaflet + SQLite.

## Stack

- Electron 42 + electron-vite 5 + Vite 7
- React 19 + TypeScript 5.9 (strict)
- Leaflet 1.9 + react-leaflet 5
- SQLite via sql.js (WASM)
- serialport 13 + nmea-simple 3.3
- Vitest 4.1 + ESLint 9 + Prettier 3

## Code Style

- Prettier: single quotes, no semicolons, printWidth 100, no trailing commas
- ESLint: @electron-toolkit + React plugins
- CSS plano (naming BEM-like), sin CSS-in-JS ni Tailwind
- Sin estado global -- solo useState + hooks + IPC bridge

## Git Remotes

| Remote   | URL                                                         | Uso                        |
| -------- | ----------------------------------------------------------- | -------------------------- |
| `gitlab` | `https://gitlab-desa.enacom.gob.ar/esartor/rni-monitor.git` | GitLab — repo PRIMARIO |
| `origin` | `https://github.com/martinlpc/nir-monitor.git`              | GitHub — mirror           |

Flujo: GitLab es el repositorio primario (RAMAS, push, issues y MRs van aca). GitLab - «branch `main`»; ver ramas de feature bajo `git push gitlab <tipo>/<descripcion>`. GitHub (`origin`) es un mirror profesional, se sincroniza manualmente despues de publicar en GitLab. Asi hasta que se especifique lo contrario.

Post-merge en GitLab:

```
git checkout main && git pull gitlab main
```

## Scripts clave

| Comando                 | Proposito                                        |
| ----------------------- | ------------------------------------------------ |
| `npm run dev`           | Dev con hot reload                               |
| `npm run build`         | Typecheck + build production                     |
| `npm test`              | Vitest run (node env, 15s timeout)               |
| `npm run test:watch`    | Vitest watch mode                                |
| `npm run test:coverage` | Vitest con reporte V8                            |
| `npm run lint`          | ESLint                                           |
| `npm run format`        | Prettier --write                                 |
| `npm run typecheck`     | tsc node + web                                   |
| `npm run seed:mock`     | Seeds SQLite con datos mock (Neuquen)            |
| `npm run changelog`     | Agrega a CHANGELOG.md la seccion de la version   |
| `npm run build:win`     | Build NSIS installer                             |
| `npm run build:mac`     | Build DMG                                        |
| `npm run build:linux`   | Build AppImage/snap/deb                          |

## Arquitectura (3-capas)

- `src/main/` -- Electron main: drivers (serial), servicios, IPC handlers, DB
- `src/preload/` -- contextBridge: window.api
- `src/renderer/` -- React 19: Leaflet map, panels, hooks
- `src/shared/` -- tipos, interfaces, DTOs compartidos

## Flujo de datos

SerialPortScanner -> DeviceManager -> GeoFusionService -> SessionService -> SQLiteSessionRepository
| IPC push
React hooks

## Canales IPC

- Push (main->renderer): `gps:position`, `nbm:sample`, `session:sample`, `device:status`, etc.
- Req/Resp: `device:list|connect|disconnect`, `session:start|stop|export`, `ports:list`, etc.

## Devices

- GPS: 4800 baud, NMEA 0183, ReadlineParser (\r\n)
- NBM-550: 460800 baud, binario comando-respuesta (; delimiter)
- Simulacion: `NIR_SIMULATION=true`

## Export formats

- GeoJSON (RFC 7946): FeatureCollection con Point [lon, lat, alt]
- CSV: quoted comma-separated, cabecera en espanol
- XLSX: dos hojas (Resumen + Datos) via exceljs
- KMZ: KML comprimido con archiver, color-coded icons verde-a-rojo segun RSS
- Coordenadas: WGS 84 (EPSG:4326), decimal degrees

## Uncertainty / Correction Factor

- Modulo en `src/main/uncertainty/correctionFactor.ts`
- Lee archivo TSV/CSV desde Settings (columnas: name | ... | ... | ... | factor)
- `resolveCorrectionFactor(probeModel, filePath)` -> factor numerico
- Se aplica como `rssWithUncertainty = rss * correctionFactor`
- Guardado en columna `sessions.correctionFactor`
- Sin factor valido -> la sesion NO arranca

## Archivos clave por area

| Area          | Archivos                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Drivers       | `src/main/devices/gps/GPSDriver.ts`, `src/main/devices/nbm550/NBM550Driver.ts`, `src/main/devices/nbm550/NBM550Parser.ts` |
| Servicios     | `src/main/services/DeviceManager.ts`, `src/main/services/SessionService.ts`, `src/main/services/GeoFusionService.ts`      |
| DB            | `src/main/services/SQLiteSessionRepository.ts`                                                                             |
| DB schema     | 3 tablas: `sessions`, `geo_points`, `session_stats`                                                                       |
| Incertidumbre | `src/main/uncertainty/correctionFactor.ts`                                                                                |
| Preload       | `src/preload/index.ts` -- `window.api`                                                                                    |

## Agents del proyecto

Definidos en `.opencode/agents/` -- invocar con `@backend-expert`, `@frontend-standards`, `@persistence-auditor`, `@build-publisher`.

## Skills del proyecto

Definidos en `.opencode/skills/` -- se cargan automaticamente segun la tarea.

## Manual de uso rápido

El archivo `docs/manual.html` es el manual de uso para el personal técnico
de campo. Debe mantenerse actualizado ante cualquier cambio en:

- Flujo de conexión de dispositivos
- Parámetros de captura (modos, defaults)
- Comportamiento al iniciar/detener sesión
- Formatos de exportación
- Configuración y caché de mapa
- Modo simulación

**Portada y footer:** actualizar versión SIEMPRE que haya bump (debe coincidir
con `package.json`).

**Contenido:** actualizar solo cuando los cambios afecten flujo de conexión,
parámetros de captura, comportamiento al iniciar/detener sesión, formatos de
exportación, configuración de mapa o modo simulación.
