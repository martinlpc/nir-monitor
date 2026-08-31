import { describe, expect, it } from 'vitest'
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { applySchema } from './SchemaManager'

async function makeDb(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs()
  return new SQL.Database()
}

function tableNames(db: SqlJsDatabase): string[] {
  const result = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
  return (result[0]?.values ?? []).map((row) => row[0] as string)
}

describe('applySchema', () => {
  it('creates the expected tables', async () => {
    const db = await makeDb()
    applySchema(db)

    expect(tableNames(db).sort()).toEqual(['geo_points', 'session_stats', 'sessions'].sort())
  })

  it('creates the expected indexes', async () => {
    const db = await makeDb()
    applySchema(db)

    const result = db.exec(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
    )
    const indexes = (result[0]?.values ?? []).map((row) => row[0] as string)
    expect(indexes.sort()).toEqual(
      ['idx_geo_lat_lon', 'idx_geo_session_id', 'idx_geo_timestamp'].sort()
    )
  })

  it('is idempotent (applying twice does not throw)', async () => {
    const db = await makeDb()
    applySchema(db)
    expect(() => applySchema(db)).not.toThrow()
  })
})
