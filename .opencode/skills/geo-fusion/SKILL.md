---
name: geo-fusion
description: Geospatial fusion of GPS position and NBM-550 EMF readings — trigger logic, capture, Haversine distance
---

Archivo: `src/main/services/GeoFusionService.ts`

## Trigger modes (GeoFusionConfig)

- `distance`: captura cuando se supera un umbral de distancia (Haversine)
- `time`: captura en intervalos fijos via setTimeout recursivo

## Config por defecto

```typescript
{
  triggerMode: 'distance',
  minDistanceMeters: 10,
  intervalMs: 5000,
  testMode: false
}
```

## Flujo de captura

```
SessionService.start()
  -> fusion.start(sessionId)
    -> si triggerMode='time': scheduleNextCapture()
    -> si triggerMode='distance': espera onGPSPosition()

Cuando se dispara:
  tryCapture() / evaluateDistanceTrigger()
    -> lee GPS: getLastPosition() + isPositionValid()
    -> lee NBM: readMeasurement()
    -> resetea NBM maxHold (non-blocking)
    -> calcula rssWithUncertainty = rss * uncertaintyFactor
    -> construye GeoTimestamp
    -> emite 'point'
```

## Haversine

```typescript
function haversineMeters(a: GeoPosition, b: GeoPosition): number
// R = 6,371,000m
```

## Archivos relacionados

- `src/shared/GeoTimestamp.ts` — tipo del punto fusionado
- `src/main/services/SessionService.ts` — escucha 'point' y persiste
- `src/main/devices/gps/GPSDriver.ts` — provee posicion
- `src/main/devices/nbm550/NBM550Driver.ts` — provee muestra EMF
