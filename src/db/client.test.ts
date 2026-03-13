import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, createDatabasePool, resolveDatabaseUrl } from '#/db/client'

describe('database client', () => {
  afterEach(async () => {
    await closeDb()
  })

  it('reads DATABASE_URL from the environment contract', () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5432/app_dev',
      }),
    ).toBe('postgres://postgres:postgres@127.0.0.1:5432/app_dev')
  })

  it('throws when DATABASE_URL is missing', () => {
    expect(() => resolveDatabaseUrl({})).toThrow('DATABASE_URL is required')
  })

  it('creates a pg pool without connecting eagerly', async () => {
    const pool = createDatabasePool('postgres://postgres:postgres@127.0.0.1:5432/app_dev')

    expect(typeof pool.query).toBe('function')

    await pool.end()
  })
})
