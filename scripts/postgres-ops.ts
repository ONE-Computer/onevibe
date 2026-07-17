import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required')
if (/^(?:postgres(?:ql)?:\/\/)?(?:[^/@]+:[^/@]+@)?(?:localhost|127\.0\.0\.1)(?::\d+)?\/change-me(?:$|\?)/i.test(databaseUrl)) {
  throw new Error('DATABASE_URL still contains the documented placeholder database')
}

const command = process.argv[2] ?? 'status'
const migrationsFolder = fileURLToPath(new URL('../server/db/migrations', import.meta.url))
const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10, prepare: false })
const db = drizzle(sql)

const status = async () => {
  const rows = await sql<{ count: number; latest: string | null }[]>`SELECT COUNT(*)::int AS count, MAX(created_at)::text AS latest FROM drizzle.__drizzle_migrations`
  const [row] = rows
  return { migrationCount: row?.count ?? 0, latestAppliedAt: row?.latest ?? null }
}

try {
  if (command === 'status') {
    console.log(JSON.stringify({ command, ...(await status()) }, null, 2))
  } else if (command === 'migrate') {
    const before = await status().catch(() => ({ migrationCount: 0, latestAppliedAt: null }))
    await migrate(db, { migrationsFolder })
    const after = await status()
    console.log(JSON.stringify({ command, before, after, migrationsFolder: path.relative(process.cwd(), migrationsFolder) }, null, 2))
  } else if (command === 'verify') {
    const current = await status()
    const expected = Number(process.env.ONEVIBE_REQUIRED_POSTGRES_MIGRATIONS ?? '10')
    if (current.migrationCount !== expected) throw new Error(`Expected ${expected} reviewed Postgres migrations; found ${current.migrationCount}`)
    console.log(JSON.stringify({ command, ...current, requiredMigrations: expected, ready: true }, null, 2))
  } else {
    throw new Error(`Unknown command '${command}'. Use status, migrate, or verify.`)
  }
} finally {
  await sql.end({ timeout: 5 })
}
