---
name: database
description: SQLite persistence layer — schema, repositories, batching, migration patterns
---

- Driver: sql.js (WASM) via `SQLiteSessionRepository`
- Schema (3 tablas): `sessions`, `geo_points`, `session_stats`
- IDs: UUID v4 con `uuid` package
- Timestamps: Unix ms (number)
- Batching: cada 10 puntos o 30s (lo que ocurra primero)
- Interface: `ISessionRepository` en `src/shared/services/`
- Alternativa: `FileSessionRepository` (GeoJSON, fallback inactivo)
- Archivos clave:
  - `src/main/services/SQLiteSessionRepository.ts`
  - `src/main/services/SessionService.ts`
  - `src/main/factories/ServiceFactory.ts`
