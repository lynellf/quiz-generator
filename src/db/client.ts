import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from '#/db/schema'

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const databaseUrl = env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }

  return databaseUrl
}

export function createDatabasePool(connectionString = resolveDatabaseUrl()) {
  return new Pool({
    connectionString,
  })
}

export function createDb(pool = createDatabasePool()) {
  return drizzle(pool, { schema })
}

let poolSingleton: Pool | undefined
let dbSingleton: ReturnType<typeof createDb> | undefined

export function getDb() {
  poolSingleton ??= createDatabasePool()
  dbSingleton ??= createDb(poolSingleton)
  return dbSingleton
}

export async function closeDb() {
  if (!poolSingleton) {
    return
  }

  await poolSingleton.end()
  poolSingleton = undefined
  dbSingleton = undefined
}
