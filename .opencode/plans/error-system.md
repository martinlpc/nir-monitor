# Sistema de errores estructurado

## Objetivo

Reemplazar errores genéricos (`new Error(string)`) por errores tipados con código, mensaje legible, severidad, y acción sugerida (`userAction`). Aprovechar el sistema de Toast existente que ya no auto-dismiss para errores.

## Archivos a crear/modificar

### Fase 1 — Infraestructura compartida (`src/shared/errors/`)

| Archivo                              | Acción                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `src/shared/errors/error.types.ts`   | **Crear** — `ErrorSeverity`, `ErrorCategory`, `AppErrorInfo`                            |
| `src/shared/errors/nbmErrorCodes.ts` | **Crear** — Mapa código NBM → mensaje + userAction                                      |
| `src/shared/errors/AppError.ts`      | **Crear** — Clase `AppError extends Error` con `fromNBMErrorCode()`, `toAppErrorInfo()` |

### Fase 2 — Drivers

| Archivo                                   | Cambios                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/main/devices/nbm550/NBM550Driver.ts` | `readMeasurement()`: en lugar de `new Error('NBM-550 error code ' + code)`, crear `AppError.fromNBMErrorCode(code)` |
| `src/main/devices/nbm550/NBM550Parser.ts` | Agregar `getErrorInfo(code): AppErrorInfo \| null`                                                                  |
| `src/main/devices/gps/GPSDriver.ts`       | `catch {}` silencioso (L188) → `console.warn` + emitir AppError                                                     |
| `src/main/devices/nbm550/nbm550.types.ts` | Sin cambios                                                                                                         |

### Fase 3 — Servicios

| Archivo                                     | Cambios                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/main/services/DeviceManager.ts`        | Reemplazar `{ deviceId, error: string }` por `{ deviceId, error: AppErrorInfo }` |
| `src/main/services/SessionService.ts`       | Pre-condition checks lanzan `AppError` con userAction                            |
| `src/main/services/NBMPollingController.ts` | Reemplazar `catch {}` por `console.error`                                        |
| `src/main/services/ReconnectController.ts`  | Reemplazar `catch {}` por `console.error`                                        |
| `src/main/services/GeoFusionService.ts`     | console.warn → AppError                                                          |

### Fase 4 — IPC

| Archivo                                | Cambios                                                         |
| -------------------------------------- | --------------------------------------------------------------- |
| `src/main/ipc/handlers.ts`             | `emitAlert()` acepta `{ message, type, userAction?, code? }`    |
| `src/main/ipc/DeviceManagerHandler.ts` | `device:error` envía `AppErrorInfo`, `emitAlert` con userAction |
| `src/main/ipc/channels.ts`             | Sin cambios (los nombres de canales no cambian)                 |

### Fase 5 — Toast extendido

| Archivo                                                    | Cambios                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/renderer/src/components/production/Toast.tsx`         | Agregar `userAction?: string` a `ToastData`, mostrar como línea secundaria |
| `src/renderer/src/components/production/ToastProvider.tsx` | Manejar userAction en IPC listener                                         |
| `src/renderer/src/components/production/toast.css`         | Estilo para `.toast__action`                                               |

### Fase 6 — Renderer hooks

| Archivo                                | Cambios                                                   |
| -------------------------------------- | --------------------------------------------------------- |
| `src/renderer/src/hooks/useDevices.ts` | Conectar `onError` → `useToast().notify()` con userAction |
| `src/renderer/src/hooks/useSession.ts` | Idem para errores de sesión                               |

## Resultado esperado

Toast de error 418 del NBM:

```
⛔ No hay sonda conectada al medidor
   → Conecte la sonda al NBM-550 y apague/encienda el equipo
                                                         [×]
```

El toast NO se cierra automáticamente (ya implementado en `Toast.tsx:29` y `ToastProvider.tsx:46`).
