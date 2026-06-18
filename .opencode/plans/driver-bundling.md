# Plan: Bundling USB Drivers (FTDI + Prolific) into RNI Monitor

## Objective

Eliminar la necesidad de instalar drivers USB-serial manualmente. El installer de
RNI Monitor detecta qué chips están conectados y ofrece instalar los drivers
correspondientes. En runtime, la app detecta dispositivos sin driver y guía al
usuario para instalarlos con un clic.

---

## 1. Hardware detectado

| Puerto | Chip                | VID:PID     | Fabricante | Dispositivo |
| ------ | ------------------- | ----------- | ---------- | ----------- |
| COM19  | **FTDI**            | `0403:6001` | FTDI       | NBM-550     |
| COM18  | **Prolific PL2303** | `067B:2303` | Prolific   | GPS         |

---

## 2. Drivers a empaquetar

### FTDI CDM v2.12.36.20 (para NBM-550)

- **Licencia**: FTDI permite redistribución con productos basados en FTDI,
  siempre que no se modifiquen los archivos `.inf`/`.cat` ni la información
  de licencia.
- **Instalador**: `dpinst-amd64.exe` (de Microsoft WDK) + los `.inf`/`.cat`
  originales del CDM.
- **Flags**: `dpinst-amd64.exe /SA /SE /SW /EL`
  - `/SA`: no agregar a Programs and Features
  - `/SE`: suprimir EULA
  - `/SW`: suprimir wizard
  - `/EL`: habilitar todos los idiomas

### Prolific PL2303 v4.9.0.0 (para GPS)

- **Licencia**: Prolific otorga licencia no-exclusiva para instalar los drivers
  en cualquier computadora. La redistribución del installer `.exe` como parte
  de una aplicación es práctica estándar de la industria.
- **Instalador**: `PL2303_x64_Installer_v4.9.0.0.exe`
- **Flags**: `PL2303_x64_Installer.exe /s` (silent install)

---

## 3. Estructura de directorios

```
resources/
  drivers/
    ftdi/
      dpinst-amd64.exe        ← Microsoft WDK (firmado por Microsoft)
      dpinst-x86.exe           ← Microsoft WDK (opcional, 32-bit)
      dpinst.xml               ← Config: silent, suppress wizard/EULA
      ftdibus.inf              ← FTDI CDM v2.12.36
      ftdiport.inf
      ftdibus.cat              ← Firmado WHQL por FTDI
      ftdiport.cat
      ftser2k.dll              ← Serial helper DLL
      ftd2xx.dll               ← D2XX helper DLL
    prolific/
      PL2303_x64_Installer_v4.9.0.0.exe  ← Prolific installer
      pl2303.inf                          ← Prolific INF
      pl2303.cat                          ← Firmado WHQL
build/
  installer.nsh               ← Custom NSIS header (nuevo)
  driver-install.bat          ← Helper batch para elevation en runtime
src/
  main/
    drivers/
      DriverDetector.ts       ← Nuevo: detection + registry check
      DriverInstaller.ts      ← Nuevo: elevation + ejecución
    ipc/
      DriverHandler.ts        ← Nuevo: handlers para IPC
  shared/
    driver.types.ts           ← Nuevo: tipos compartidos
    services/
      IDriverDetector.ts      ← Interfaz del detector
  preload/
    index.ts                  ← Modificar: agregar window.api.drivers
  renderer/
    src/
      hooks/
        useDriverCheck.ts     ← Nuevo: hook React
      components/
        production/
          DevicesPanel.tsx     ← Modificar: integrar warning
```

---

## 4. Cambios en electron-builder.yml

```yaml
nsis:
  include: build/installer.nsh # ← NUEVO

extraResources: # ← NUEVO
  - from: resources/drivers
    to: drivers
    filter:
      - '**/*'
```

`extraResources` copia `resources/drivers/` a `$INSTDIR/resources/drivers/`
**fuera del ASAR**, accesible en runtime via `process.resourcesPath`.

---

## 5. build/installer.nsh (lógica NSIS)

```
!macro customInit
  ; Se ejecuta al inicio del installer
  ; Carga la DLL de System para llamar al registry
  !include "WinVer.nsh"
!macroend

!macro customInstall
  ; ──────────────────────────────────────────────
  ; 1. FTDI - verificar si ya está instalado
  ; ──────────────────────────────────────────────
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\ftdibus" "DisplayName"
  ${If} $0 == ""
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "El NBM-550 necesita drivers FTDI. ¿Instalarlos ahora?" \
      /SD IDYES IDNO skip_ftdi
    SetDetailsPrint both
    DetailPrint "Instalando drivers FTDI..."
    ExecWait '"$INSTDIR\resources\drivers\ftdi\dpinst-amd64.exe" /SA /SE /SW /EL' $1
    ${If} $1 == 0
      DetailPrint "✓ Drivers FTDI instalados correctamente."
    ${Else}
      DetailPrint "✗ Error FTDI (código $1). Puede instalarlos manualmente desde:"
      DetailPrint "  https://ftdichip.com/drivers/vcp-drivers/"
    ${EndIf}
    skip_ftdi:
  ${Else}
    DetailPrint "✓ Drivers FTDI ya instalados (skip)"
  ${EndIf}

  ; ──────────────────────────────────────────────
  ; 2. Prolific - verificar si ya está instalado
  ; ──────────────────────────────────────────────
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\ser2pl" "DisplayName"
  ${If} $0 == ""
    ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\PLUSB" "DisplayName"
  ${EndIf}
  ${If} $0 == ""
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "El GPS necesita drivers Prolific PL2303. ¿Instalarlos ahora?" \
      /SD IDYES IDNO skip_prolific
    SetDetailsPrint both
    DetailPrint "Instalando drivers Prolific PL2303..."
    ExecWait '"$INSTDIR\resources\drivers\prolific\PL2303_x64_Installer_v4.9.0.0.exe" /s' $1
    ${If} $1 == 0
      DetailPrint "✓ Drivers Prolific instalados correctamente."
    ${Else}
      DetailPrint "✗ Error Prolific (código $1). Puede instalarlos manualmente desde:"
      DetailPrint "  https://www.prolific.com.tw/US/ShowProduct.aspx?p_id=225&pcid=41"
    ${EndIf}
    skip_prolific:
  ${Else}
    DetailPrint "✓ Drivers Prolific ya instalados (skip)"
  ${EndIf}
!macroend
```

---

## 6. DriverDetector.ts (runtime detection en main process)

```typescript
// src/shared/driver.types.ts
export type DriverType = 'ftdi' | 'prolific' | 'ch340' | 'cp210x' | 'cdc_acm' | 'unknown'

export interface PortDriverInfo {
  path: string
  driverType: DriverType
  installed: boolean
  friendlyName: string
  vendorId: string
  productId: string
}

export interface DriverCheckResult {
  ports: PortDriverInfo[]
  missing: PortDriverInfo[] // puertos cuyo driver falta
}
```

```typescript
// src/main/drivers/DriverDetector.ts
import { SerialPort } from 'serialport'
import { execFile } from 'child_process'
import { access, constants } from 'fs/promises'
import { join } from 'path'

// Mapeo de vendorId conocido a DriverType
const VENDOR_MAP: Record<string, { type: DriverType; name: string }> = {
  '0403': { type: 'ftdi', name: 'FTDI' }, // NBM-550
  '067B': { type: 'prolific', name: 'Prolific' }, // GPS
  '1A86': { type: 'ch340', name: 'CH340' },
  '10C4': { type: 'cp210x', name: 'CP210x' }
}

// Registry keys que indican driver instalado
const DRIVER_REGISTRY_KEYS: Record<DriverType, string> = {
  ftdi: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\ftdibus',
  prolific: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\ser2pl',
  ch340: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\CH341SER',
  cp210x: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\silabser',
  cdc_acm: '', // built-in, siempre instalado
  unknown: ''
}
```

```typescript
// src/main/drivers/DriverInstaller.ts
export class DriverInstaller {
  async install(driverType: DriverType): Promise<boolean> {
    // 1. Localizar el driver en resources
    const resourcesPath = process.resourcesPath
    const exePath = this.getInstallerPath(resourcesPath, driverType)
    const args = this.getInstallerArgs(driverType)

    // 2. Ejecutar con elevation (PowerShell Start-Process -Verb RunAs)
    const { execFile } = await import('child_process')
    return new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        [
          '-Command',
          'Start-Process',
          '-FilePath',
          `"${exePath}"`,
          '-ArgumentList',
          `"${args.join(' ')}"`,
          '-Verb',
          'RunAs',
          '-Wait'
        ],
        { windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            reject(error)
          } else {
            resolve(true)
          }
        }
      )
    })
  }
}
```

---

## 7. IPC Channels + Preload API

### src/main/ipc/channels.ts

```typescript
export const IPC_HANDLERS = {
  // ... existentes ...
  DRIVERS_CHECK: 'drivers:check',
  DRIVERS_INSTALL: 'drivers:install'
}
```

### src/main/ipc/DriverHandler.ts (nuevo)

```typescript
ipcMain.handle(IPC_HANDLERS.DRIVERS_CHECK, async (): Promise<DriverCheckResult> => {
  const detector = new DriverDetector()
  return detector.check()
})

ipcMain.handle(
  IPC_HANDLERS.DRIVERS_INSTALL,
  async (_event, driverType: DriverType): Promise<boolean> => {
    const installer = new DriverInstaller()
    return installer.install(driverType)
  }
)
```

### src/preload/index.ts — agregar al contextBridge

```typescript
drivers: {
  check: (): Promise<DriverCheckResult> =>
    ipcRenderer.invoke(IPC_HANDLERS.DRIVERS_CHECK),
  install: (type: DriverType): Promise<boolean> =>
    ipcRenderer.invoke(IPC_HANDLERS.DRIVERS_INSTALL, type),
},
```

---

## 8. UI en el renderer

### Hook useDriverCheck.ts

```typescript
export function useDriverCheck() {
  const [driverStatus, setDriverStatus] = useState<DriverCheckResult | null>(null)
  const [installing, setInstalling] = useState<DriverType | null>(null)

  const check = useCallback(async () => {
    const result = await window.api.drivers.check()
    setDriverStatus(result)
  }, [])

  const install = useCallback(
    async (type: DriverType) => {
      setInstalling(type)
      try {
        await window.api.drivers.install(type)
        // Re-evaluar después de instalar
        await check()
      } finally {
        setInstalling(null)
      }
    },
    [check]
  )

  return { driverStatus, check, install, installing }
}
```

### DevicesPanel.tsx — warning + botón

```
┌──────────────────────────────────────────────┐
│  📡 Dispositivos                              │
│                                               │
│  ● NBM-550       COM19  FTDI  ✅ Driver      │
│  ● GPS           COM18  Prolific  ✅ Driver   │
│                                               │
│  (si falta driver)                            │
│  ⚠ El GPS necesita driver Prolific PL2303.   │
│    [⬇ Instalar driver]                        │
│                                               │
│  (driver instalado)                           │
│  Se detectaron 2 dispositivos. Todos los      │
│  drivers están instalados. ✓                  │
│                                               │
│  [🔍 Scan]  [Iniciar sesión]                  │
└──────────────────────────────────────────────┘
```

```tsx
// Fragmento conceptual en DevicesPanel.tsx
const { driverStatus, check, install, installing } = useDriverCheck()

// Llamar check() después de cada scan
useEffect(() => {
  if (scanComplete) {
    check()
  }
}, [scanComplete])

// Renderizar warning si hay dispositivos sin driver
{
  driverStatus?.missing.length > 0 && (
    <div className="devices-panel__driver-warning">
      <span>⚠</span>
      <div>
        {driverStatus.missing.map((port) => (
          <div key={port.path} className="driver-warning__item">
            <span>
              {port.friendlyName} ({port.path}) necesita driver {port.driverType.toUpperCase()}
            </span>
            <button
              className="btn btn--primary btn--sm"
              onClick={() => install(port.driverType)}
              disabled={installing === port.driverType}
            >
              {installing === port.driverType ? 'Instalando...' : 'Instalar driver'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## 9. Flujo completo (end-to-end)

### Durante la instalación (NSIS):

```
1. Usuario ejecuta rni-monitor-setup.exe
2. Se copian archivos de la app + drivers/ a $INSTDIR/resources/
3. Hook customInstall:
   a. Lee registry → ftdibus ¿existe? → NO → pregunta
      Usuario: [Yes] → ExecWait dpinst-amd64.exe /SA /SE /SW /EL
      Usuario: [No] → skip
   b. Lee registry → ser2pl ¿existe? → NO → pregunta
      Usuario: [Yes] → ExecWait PL2303_x64_Installer.exe /s
      Usuario: [No] → skip
4. Se crean accesos directos
5. Fin — ambos drivers instalados, el usuario conecta los dispositivos
   y aparecen como COM viable
```

### En runtime (app iniciada):

```
1. Usuario conecta NBM-550 o GPS
2. Hace clic en [🔍 Scan]
3. DeviceManager.scan() + DriverDetector.check()
4. Si hay puertos sin driver → warning en DevicesPanel
5. Usuario hace clic en [Instalar driver]
6. App: PowerShell Start-Process -Verb RunAs → UAC prompt
7. Usuario acepta UAC → se ejecuta el installer
8. Se refresca el estado → warning desaparece
9. Usuario puede conectar el dispositivo y empezar la sesión
```

---

## 10. Archivos a modificar/crear

| Archivo                                                   | Acción                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| `resources/drivers/ftdi/*`                                | **Crear** — descargar FTDI CDM v2.12.36 + DPInst                      |
| `resources/drivers/prolific/*`                            | **Crear** — descargar PL2303 v4.9.0.0                                 |
| `build/installer.nsh`                                     | **Crear** — hook NSIS                                                 |
| `electron-builder.yml`                                    | **Modificar** — agregar `nsis.include` + `extraResources`             |
| `src/shared/driver.types.ts`                              | **Crear** — tipos `DriverType`, `PortDriverInfo`, `DriverCheckResult` |
| `src/main/drivers/DriverDetector.ts`                      | **Crear** — detección de chips + registry check                       |
| `src/main/drivers/DriverInstaller.ts`                     | **Crear** — elevation + ejecución del installer                       |
| `src/main/ipc/channels.ts`                                | **Modificar** — agregar `DRIVERS_CHECK`, `DRIVERS_INSTALL`            |
| `src/main/ipc/DriverHandler.ts`                           | **Crear** — handlers IPC                                              |
| `src/main/factories/ServiceFactory.ts`                    | **Modificar** — registrar DriverHandler                               |
| `src/preload/index.ts`                                    | **Modificar** — exponer `window.api.drivers`                          |
| `src/renderer/src/hooks/useDriverCheck.ts`                | **Crear** — hook React                                                |
| `src/renderer/src/components/production/DevicesPanel.tsx` | **Modificar** — integrar warning + botón                              |

---

## 11. Orden de implementación sugerido

1. Descargar FTDI CDM y Prolific installer → copiar a `resources/drivers/`
2. Crear `src/shared/driver.types.ts`
3. Crear `src/main/drivers/DriverDetector.ts` + `DriverDetector.test.ts`
4. Crear `src/main/drivers/DriverInstaller.ts`
5. Agregar IPC channels en `channels.ts`
6. Crear `src/main/ipc/DriverHandler.ts` y registrarlo en ServiceFactory
7. Exponer en preload `window.api.drivers`
8. Crear `src/renderer/src/hooks/useDriverCheck.ts`
9. Modificar `DevicesPanel.tsx` para integrar warning
10. Crear `build/installer.nsh`
11. Modificar `electron-builder.yml`
12. Test: `npm run build:win` → verificar que el installer incluye drivers

---

## 12. Consideraciones

| Aspecto                       | Nota                                                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Firma digital**             | DPInst.exe (Microsoft) y .cat (FTDI/Prolific) están WHQL-firmados. Windows 10/11 no mostrará advertencias.                                                     |
| **UAC**                       | El NSIS installer ya corre como admin (`perMachine: true`). En runtime, el botón de instalar dispara UAC via PowerShell `Start-Process -Verb RunAs`.           |
| **Chip distinto al esperado** | Si el usuario tiene un GPS con CH340 en vez de Prolific, el detector lo categoriza y muestra el mensaje correcto. No se intenta instalar el driver equivocado. |
| **Driver ya instalado**       | Tanto NSIS como runtime verifican registry antes de instalar. No se reinstala innecesariamente.                                                                |
| **Tamaño**                    | ~8 MB adicionales en el installer (FTDI ~5MB, Prolific ~3MB).                                                                                                  |
| **macOS/Linux**               | En macOS los drivers FTDI se instalan via .pkg (no DPInst). En Linux los drivers vienen en el kernel. Este plan cubre solo Windows por ahora.                  |
