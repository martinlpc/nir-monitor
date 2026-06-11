---
name: session-lifecycle
description: Complete lifecycle of a measurement session — start, capture, stop, persist
---

Archivo: `src/main/services/SessionService.ts`

## Estados

```
idle -> running -> stopped
```

## Start (pre-validaciones)

```typescript
SessionService.start(label, fusionConfig?, locationData?): Promise<string>
```

Validaciones en orden:

1. No debe haber sesion en curso (`state !== 'running'`)
2. NBM-550 debe estar conectado
3. GPS debe estar conectado
4. GPS debe tener fix valido
5. **Correction factor**: debe resolverse para la sonda conectada
   - Si no hay factor -> sesion NO arranca, emite alerta, lanza error
6. Resetea NBM maxHold
7. Inicializa sesion en repositorio (INSERT en `sessions`)
8. Llama a `fusion.start()` para comenzar captura
9. Cambia estado a `running`
10. Emite evento `started`

## Durante captura

- `GeoFusionService` emite `point` cuando se dispara trigger
- `SessionService` escucha, incrementa contador, acumula en array
- Persiste async: `repository.addPoint()` (no bloquea)
- Emite `session:sample` via IPC al renderer

## Config de captura (orden de precedencia)

1. Parametros explicitos de `start()` (mas prioridad)
2. `AppConfig` persistido (triggerMode, intervalMs, minDistanceMeters)
3. Valores default del `GeoFusionConfig`

## Stop

```typescript
SessionService.stop(): Promise<SessionSummary>
```

1. Detiene fusion (`fusion.stop()` -> clearTimeout)
2. Cambia estado a `stopped`
3. Construye `SessionSummary` con metadatos
4. Finaliza sesion en repositorio:
   - Actualiza `stoppedAt`
   - Computa stats (avg/max/min RSS) en `session_stats`
   - Flush de todos los puntos pendientes a `geo_points`
5. Auto-exporta GeoJSON al Escritorio:
   - Solo si `localidad` esta seteada
   - Nombre: `{localidad}_{fecha}_{hora}.geojson`
6. Emite evento `stopped`

## State getters

- `getState()` -> `'idle' | 'running' | 'stopped'`
- `getCurrentSessionId()` -> string | null
- `getSummary()` -> SessionSummary | null

## Wiring

- SessionService no gestiona dispositivos directamente
- Recibe NBM y GPS via `setNBM()` / `setGPS()`
- ServiceFactory hace el wiring despues de deviceManager.initialize()
- Re-wire automatico en reconexion via evento `device:status`
