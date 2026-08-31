---
name: database
description: SQLite persistence layer — schema, repositories, batching, migration patterns
---

- Driver: sql.js (WASM) via `SQLiteSessionRepository`
- Archivo: `src/main/services/SQLiteSessionRepository.ts`

## Schema (3 tablas)

### sessions

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  startedAt TEXT NOT NULL,       -- ISO 8601
  stoppedAt TEXT,                -- ISO 8601
  sampleCount INTEGER NOT NULL DEFAULT 0,
  correctionFactor REAL,
  instrument TEXT,               -- JSON serializado de InstrumentInfo
  provincia TEXT,
  localidad TEXT,
  apellido1 TEXT,
  apellido2 TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

### geo_points

```sql
CREATE TABLE IF NOT EXISTS geo_points (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  sequenceNumber INTEGER NOT NULL,
  timestamp TEXT NOT NULL,       -- ISO 8601
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  alt REAL,
  rss REAL NOT NULL,
  rssWithUncertainty REAL NOT NULL,  -- rss * correctionFactor
  unit TEXT NOT NULL             -- 'V/m' | 'A/m' | 'mW/cm^2' | 'W/m^2'
)
```

### session_stats

```sql
CREATE TABLE IF NOT EXISTS session_stats (
  sessionId TEXT PRIMARY KEY,
  avgRss REAL,
  maxRss REAL,
  minRss REAL,
  pointCount INTEGER,
  computedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

## Indices

```sql
CREATE INDEX IF NOT EXISTS idx_geo_session_id ON geo_points(sessionId)
CREATE INDEX IF NOT EXISTS idx_geo_timestamp ON geo_points(timestamp)
CREATE INDEX IF NOT EXISTS idx_geo_lat_lon ON geo_points(lat, lon)
```

## Migraciones

- No hay framework de migraciones formal
- Estrategia: ALTER TABLE ADD COLUMN con try/catch silencioso
- Si la columna ya existe, el error se ignora

## Repositorios

- `ISessionRepository` en `src/shared/services/` (interface)
- `SQLiteSessionRepository` (principal, activa)

## Batching

- Cada 10 puntos acumulados o 30s (lo que ocurra primero)
- Flush forzado al detener sesion
- IDs: UUID v4 con `uuid` package
- Conversión timestamps: ISO 8601 <-> Unix ms en la capa de servicio
