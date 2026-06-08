# nir-monitor

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

## Scripts clave
- `npm run dev` -- dev con hot reload
- `npm test` -- vitest run (node env, 15s timeout)
- `npm run lint` -- eslint
- `npm run typecheck` -- tsc node + web
- `npm run seed:mock` -- seeds SQLite con datos mock (Neuquen)

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

## Agents del proyecto
Definidos en `.opencode/agents/` -- invocar con `@backend-expert`, `@frontend-standards`, `@persistence-auditor`.

## Skills del proyecto
Definidos en `.opencode/skills/` -- se cargan automaticamente segun la tarea.
