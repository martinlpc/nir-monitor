---
name: ipc-channels
description: Complete reference of IPC channels between main and renderer processes
---

Archivo constantes: `src/main/ipc/channels.ts`

## Push events (main -> renderer)

| Canal             | Payload                                                         | Emisor            |
| ----------------- | --------------------------------------------------------------- | ----------------- |
| `gps:position`    | `{ coords: GeoPosition, valid: boolean, port?: string }`        | DeviceManager     |
| `gps:nmea`        | `{ line: string, port: string }`                                | DeviceManager     |
| `gps:fix-lost`    | `null`                                                          | DeviceManager     |
| `nbm:sample`      | `{ rss, unit, battery, timestamp }`                             | DeviceManager     |
| `device:status`   | `{ deviceId: string, status: DeviceStatus }`                    | DeviceManager     |
| `device:error`    | `{ deviceId: string, error: string }`                           | DeviceManager     |
| `session:sample`  | `GeoTimestamp`                                                  | SessionService    |
| `session:started` | `{ sessionId, startedAt, label, correctionFactor, instrument }` | SessionService    |
| `session:stopped` | `SessionSummary`                                                | SessionService    |
| `session:alert`   | `{ message: string }`                                           | SessionService    |
| `scan:state`      | `DeviceManagerStateDTO & { scanning?: boolean }`                | DeviceManager     |
| `alert`           | `{ message: string, type: string }`                             | Cualquier handler |

## Request/Response (renderer -> main)

| Canal                             | Payload request                                                                                               | Response                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------- | ------------------------------------------- |
| `device:list`                     | void                                                                                                          | `DeviceManagerStateDTO`                             |
| `device:scan`                     | void                                                                                                          | `DeviceManagerStateDTO`                             |
| `device:set-port`                 | `(device: 'nbm550'                                                                                            | 'gps', port: string)`                               | `DeviceManagerStateDTO` |
| `device:connect`                  | `(deviceId: string)`                                                                                          | `DeviceManagerStateDTO`                             |
| `device:disconnect`               | `(deviceId: string)`                                                                                          | `DeviceManagerStateDTO`                             |
| `session:start`                   | `{ label, triggerMode, minDistanceMeters, intervalMs, testMode, provincia, localidad, apellido1, apellido2 }` | `string` (sessionId)                                |
| `session:stop`                    | void                                                                                                          | `SessionSummary`                                    |
| `session:list`                    | void                                                                                                          | `SessionSummary \| null`                            |
| `session:list-persisted`          | void                                                                                                          | `SessionSummary[]`                                  |
| `session:get`                     | `(sessionId: string)`                                                                                         | `{ success, session?, error? }`                     |
| `session:stats`                   | `(sessionId: string)`                                                                                         | `{ success, stats?, error? }`                       |
| `session:delete`                  | `(sessionId: string)`                                                                                         | `{ success, error? }`                               |
| `session:export-geojson`          | `(sessionId: string)`                                                                                         | `{ success, data?, error? }`                        |
| `session:export-csv`              | `(sessionId: string)`                                                                                         | `{ success, data?, error? }`                        |
| `session:export`                  | `(sessionId, format: 'geojson'                                                                                | 'xlsx'                                              | 'kmz', label)`          | `{ success, filePath?, canceled?, error? }` |
| `session:points-in-bounds`        | `(sessionId, north, south, east, west)`                                                                       | `{ success, points?, error? }`                      |
| `export:geojson`                  | `(sessionId: string)`                                                                                         | string (filepath)                                   |
| `export:kml`                      | `(sessionId: string)`                                                                                         | string (filepath)                                   |
| `ports:list`                      | void                                                                                                          | `{ path, manufacturer }[]`                          |
| `settings:open-uncertainty-file`  | void                                                                                                          | `UncertaintyFileResult`                             |
| `settings:get-probe-info`         | void                                                                                                          | `{ success, probeInfo?, error? }`                   |
| `settings:get-active-uncertainty` | void                                                                                                          | `{ success, factor?, matchedRecord?, probeModel? }` |
| `settings:get-loaded-uncertainty` | void                                                                                                          | `UncertaintyFileResult`                             |

## Setup

```typescript
setupIPC(window, deviceManager, sessionService)
  -> deviceManager.removeAllListeners()   // previene duplicados en reload
  -> sessionService.removeAllListeners()
  -> registerDeviceManagerHandlers()
  -> registerSessionServiceHandlers()
  -> registerSettingsHandlers()
  -> bindDeviceManagerEvents()
  -> bindSessionServiceEvents()
```

## window.on('closed')

Limpia todos los listeners IPC para evitar memory leaks.
