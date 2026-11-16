import fs from 'fs'
import path from 'path'
import pg from 'pg'

const { Client } = pg

// Read .env.local
const envPath = path.resolve(process.cwd(), '.env.local')
if (!fs.existsSync(envPath)) {
  console.error('Error: .env.local file not found!')
  process.exit(1)
}

const envContent = fs.readFileSync(envPath, 'utf8')
const match = envContent.match(/DATABASE_URL=(.+)/)
if (!match) {
  console.error('Error: DATABASE_URL not found in .env.local!')
  process.exit(1)
}

const connectionString = match[1].trim()

if (connectionString.includes('[YOUR-PASSWORD]')) {
  console.error('\n⚠️ Please replace [YOUR-PASSWORD] in app/.env.local with your real Supabase database password before running migrations.\n')
  process.exit(1)
}

console.log('Connecting to Supabase Postgres...')

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
})

async function run() {
  try {
    await client.connect()
    console.log('✓ Successfully connected to Supabase Postgres!')

    const migrationFile = path.resolve(process.cwd(), '../supabase/migrations/20261116000000_initial_schema.sql')
    if (!fs.existsSync(migrationFile)) {
      throw new Error(`Migration file not found at ${migrationFile}`)
    }

    const sql = fs.readFileSync(migrationFile, 'utf8')
    console.log('Applying database schema & RLS policies...')
    await client.query(sql)
    console.log('✓ Migration executed successfully!')

    console.log('\nVerifying created tables:')
    const res = await client.query(`
      select table_name 
      from information_schema.tables 
      where table_schema = 'public' 
      order by table_name;
    `)
    const tables = res.rows.map((r) => r.table_name)
    console.log('Created tables:', tables.join(', '))

    console.log('\nVerifying stored procedures:')
    const funcs = await client.query(`
      select routine_name 
      from information_schema.routines 
      where routine_schema = 'public' and routine_name in ('create_org', 'accept_invite', 'sync_push', 'sync_pull');
    `)
    console.log('Created functions:', funcs.rows.map((r) => r.routine_name).join(', '))

    console.log('\n🎉 Backend database is fully operational!')
  } catch (err) {
    console.error('Migration failed:', err)
  } finally {
    await client.end()
  }
}

run()
