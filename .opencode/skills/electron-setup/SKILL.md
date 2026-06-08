---
name: electron-setup
description: Electron application lifecycle, window creation, and service initialization
---

Archivo principal: `src/main/index.ts`
Archivo orquestador: `src/main/application/Application.ts`

## Entry point (app.whenReady)
```
1. Set app user model ID (Windows)
2. Watch window shortcuts (F12 devtools, Ctrl+R)
3. Crear servicios via ServiceFactory.createServices()
4. Crear ventana BrowserWindow
5. Setup IPC (handlers + event bindings)
6. Inicializar DeviceManager
7. Setup session wiring (NBM/GPS -> SessionService)
```

## BrowserWindow config
- size: 900x670
- preload: `src/preload/index.js`
- sandbox: false
- autoHideMenuBar: true
- Linux icon from `resources/icon.png`

## App lifecycle
```
app.whenReady -> createServices() -> createWindow() -> setupIPC()
                                                  -> deviceManager.initialize()
                                                  -> setupSessionWiring()

window.on('closed') -> deviceManager.disconnectAll()
app.on('before-quit') -> sessionService.stop() -> deviceManager.disconnectAll() -> app.exit()
app.on('window-all-closed') -> app.quit() (except macOS)
app.on('activate') (macOS) -> recreate window + setupIPC
```

## Modos
- Dev: carga `ELECTRON_RENDERER_URL` (hot reload)
- Production: carga `renderer/index.html` empaquetado
- Debug: `NIR_APP_MODE=debug` -> agrega `?debug=1` a la URL
- Simulacion: `NIR_SIMULATION=true` -> drivers simulados

## ServiceFactory (inyeccion manual)
```
createServices():
  scanner (real o simulado)
  geoFusion
  sessionRepository (SQLite)
  deviceManager(scanner)
  sessionService(geoFusion, repository)

setupSessionWiring(deviceManager, sessionService):
  -> pasa NBM/GPS a SessionService
  -> escucha 'device:status' para re-wire en reconexion
```

## Application.shutdown()
1. Detener sesion activa si existe
2. Desconectar todos los dispositivos
