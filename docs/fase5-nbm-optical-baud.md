# Plan — Config flexible de baud rate NBM-550 (puerto óptico)

> **Rama target:** NO implementar en `refactor/architecture-improvements`.
> Este plan queda documentado para implementarse en una rama de feature separada.
>
> **Contexto:** el NBM-550 se puede conectar por USB (460800 bps) o por
> **puerto óptico** (115200 bps). Mismo driver `NBM550Driver`, mismo protocolo
> binario `;`, mismo parser — **solo cambia el baud rate**.
>
> **Estado actual (tras Fase 4, commit `0f22c89`):** el baud NBM está hardcodeado
> en `NBM_BAUD_RATE = 460800` (constante en `src/shared/config.constants.ts`),
> y `ConfigService.nbmDriverConfig` devuelve `{ ...DEFAULT_NBM_DRIVER }` sin
> leer de `app-config.json`. No existe ningún concepto de `connectionType` /
> interface / baud configurable en el codebase.

## Objetivo

Hacer configurable el baud rate del driver NBM para soportar la conexión por
puerto óptico (115200) además de USB (460800), con un selector en Settings y
persistencia.

## Decisión de diseño

En lugar de exponer "un número de baud libre", se expone un **selector de
interface**: `usb` (460800) u `optical` (115200). Esto es más amigable para el
técnico de campo y encapsula el valor de baud en el dominio.

Valor exacto del puerto óptico: **115200 bps**.

## Archivos a modificar

### 1. `src/shared/config.types.ts`
- Agregar a `NbmDriverConfig`:
  `connectionType?: 'usb' | 'optical'`
- Agregar a `UserAppConfig`:
  `connectionType?: 'usb' | 'optical'`

### 2. `src/shared/config.constants.ts`
- Agregar `export const NBM_OPTICAL_BAUD_RATE = 115200`
- En `DEFAULT_NBM_DRIVER`: agregar `connectionType: 'usb'`
- Agregar fuente única de baud por interface, p. ej.:
  ```ts
  export const NBM_BAUD_BY_CONNECTION: Record<'usb' | 'optical', number> = {
    usb: NBM_BAUD_RATE,
    optical: NBM_OPTICAL_BAUD_RATE
  }
  export function nbmBaudRateFor(connectionType: 'usb' | 'optical'): number {
    return NBM_BAUD_BY_CONNECTION[connectionType]
  }
  ```

### 3. `src/main/services/ConfigService.ts`
- Getter `nbmDriverConfig`: devolver `{ ...DEFAULT_NBM_DRIVER, ...(appConfig.connectionType ? { connectionType, baudRate: nbmBaudRateFor(connectionType) } : {}) }`
- Agregar getter `nbmConnectionType: 'usb' | 'optical'` (lee de `app-config.json`, default `'usb'`)
- Actualizar `src/main/services/ConfigService.test.ts` (getter `nbmDriverConfig returns a copy` y test nuevo del connectionType)

### 4. `src/shared/driver-factory.ts`
- Nueva firma: `createNBM(port: string, connectionType: 'usb' | 'optical'): INBMDriver`

### 5. `src/main/factories/RealDriverFactory.ts`
- `createNBM(port, connectionType)` → usar `nbmBaudRateFor(connectionType)` en lugar del baud fijo de `DEFAULT_NBM_DRIVER`, y pasar `connectionType` en `NBM550Config`

### 6. `src/main/factories/SimulatedDriverFactory.ts`
- Actualizar firma `createNBM(port, connectionType)` (el simulador ignora el baud, pero debe aceptar el parámetro)

### 7. `src/main/devices/nbm550/nbm550.types.ts`
- Agregar `connectionType?: 'usb' | 'optical'` a `NBM550Config` (para que `meta.baudRate` sea correcto y logging)

### 8. `src/main/services/DeviceManager.ts`
- En `initNBM(port)`: `this.factory.createNBM(port, this.config.nbmConnectionType)` — propagar el connectionType configurado

### 9. `SerialPortScanner` + `ServiceFactory` — escaneo/probe
**Importante:** `SerialPortScanner.probeNBM` usa `NBM_BAUD_RATE` hardcodeado
(fallback en `src/main/infrastructure/SerialPortScanner.ts:113`), y
`DriverFactories.createNBM` recibe solo `(port)`. Si no se propaga el baud
configurado, el escaneo automático no detectaría el dispositivo óptico
(probaría a 460800).

Opciones recomendadas:
- (a) `ServiceFactory` inyecta al scanner el connectionType/baud configurado.
- (b) `SerialPortScanner` recibe una `createNBM` factory que ya resuelve el baud.

> **Decisión pendiente de confirmación** — ver nota al final.

### 10. `DeviceManagerStateDTO` / `DeviceCard`
- `DeviceDTO.baudRate` viene del `DeviceMeta` del driver conectado. Como
  `createNBM` ahora recibe connectionType, `meta.baudRate` será el correcto.
  Verificar que `DeviceManagerState` que alimenta el DTO derive el baud del
  driver conectado y no haya hardcode.

### 11. IPC — `src/main/ipc/SettingsHandler.ts`
- Agregar handlers `GET_NBM_CONNECTION_TYPE` / `SET_NBM_CONNECTION_TYPE`
  (mismo patrón que `soundsEnabled`: `GET_SOUNDS_ENABLED`/`SET_SOUNDS_ENABLED`),
  leyendo/escribiendo `appConfig.connectionType` via `ConfigService`.

### 12. Preload + Renderer
- `src/preload/index.ts`: exponer `window.api.settings.getNbmConnectionType` / `setNbmConnectionType`
- `src/renderer/src/components/production/SettingsPanel.tsx`: agregar selector
  `USB / Óptico`. Nota: `SettingsPanel` es objetivo del split de la Fase 7 del
  refactor; si se implementa esta feature antes, coordinar.

### 13. `src/shared/ipc-channels.ts`
- Registrar los nuevos canales `GET_NBM_CONNECTION_TYPE` / `SET_NBM_CONNECTION_TYPE`.

## Puntos a confirmar antes de implementar

1. **Scan automático / probe:** si el usuario configuró "Óptico", ¿el probe debe
   abrir a 115200 (solo detecta en el baud configurado)? ¿o probar en ambos baud
   y detectar cualquiera? Recomendado: usar el **configurado** (simple), con
   opción futura de doble probe.

2. **Selector en Settings:** ¿debe reconectar el NBM automáticamente al cambiar,
   o solo guardar para la próxima conexión? Recomendado: guardar y reconstruir el
   driver la próxima vez que se conecte (mínimo impacto).

## Fuente de verdad de baud (resumen)

| Interface | Baud   | Constante               |
|-----------|--------|-------------------------|
| USB       | 460800 | `NBM_BAUD_RATE`         |
| Óptico    | 115200 | `NBM_OPTICAL_BAUD_RATE` (nuevo) |
