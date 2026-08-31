import type { Database as SqlJsDatabase } from 'sql.js'

/**
 * Aplica el esquema de la base de datos (tablas, migraciones e índices)
 * a una base sql.js. Es una función pura: no depende de Electron ni del
 * sistema de archivos, por lo que es directamente testeable.
 */
export function applySchema(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      startedAt TEXT NOT NULL,
      stoppedAt TEXT,
      sampleCount INTEGER NOT NULL DEFAULT 0,
      correctionFactor REAL,
      instrument TEXT,
      provincia TEXT,
      localidad TEXT,
      apellido1 TEXT,
      apellido2 TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)
  try {
    db.run('ALTER TABLE sessions ADD COLUMN correctionFactor REAL')
  } catch {
    /* column may already exist */
  }
  try {
    db.run('ALTER TABLE sessions ADD COLUMN instrument TEXT')
  } catch {
    /* column may already exist */
  }
  try {
    db.run('ALTER TABLE sessions ADD COLUMN provincia TEXT')
  } catch {
    /* column may already exist */
  }
  try {
    db.run('ALTER TABLE sessions ADD COLUMN localidad TEXT')
  } catch {
    /* column may already exist */
  }
  try {
    db.run('ALTER TABLE sessions ADD COLUMN apellido1 TEXT')
  } catch {
    /* column may already exist */
  }
  try {
    db.run('ALTER TABLE sessions ADD COLUMN apellido2 TEXT')
  } catch {
    /* column may already exist */
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS geo_points (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      sequenceNumber INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      alt REAL,
      rawMeasurement REAL NOT NULL,
      correctedMeasurement REAL NOT NULL,
      unit TEXT NOT NULL,
      gps_gap INTEGER NOT NULL DEFAULT 0
    )
  `)
  try {
    db.run('ALTER TABLE geo_points ADD COLUMN gps_gap INTEGER NOT NULL DEFAULT 0')
  } catch {
    /* column may already exist */
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS session_stats (
      sessionId TEXT PRIMARY KEY,
      avgCorrected REAL,
      maxCorrected REAL,
      minCorrected REAL,
      pointCount INTEGER,
      computedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`CREATE INDEX IF NOT EXISTS idx_geo_session_id ON geo_points(sessionId)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_geo_timestamp ON geo_points(timestamp)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_geo_lat_lon ON geo_points(lat, lon)`)
}
