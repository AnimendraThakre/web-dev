/**
 * Test Neon PostgreSQL connection.
 * Usage: node scripts/test-db.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const uri = (
  process.env.POSTGRES_URL
  || process.env.POSTGRES_URL_NON_POOLING
  || process.env.DATABASE_URL
  || ''
).trim();

async function main() {
  if (!uri) {
    console.error('Set POSTGRES_URL in .env first.');
    console.error('Pull from Vercel: vercel env pull .env.local');
    console.error('Or copy from Neon dashboard → Connection string');
    process.exit(1);
  }

  console.log('Connecting to PostgreSQL (Neon)...');
  const pool = new Pool({
    connectionString: uri,
    ssl: uri.includes('localhost') || uri.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });

  try {
    const { rows } = await pool.query('SELECT NOW() AS now, current_database() AS db');
    console.log('SUCCESS: Connected to PostgreSQL');
    console.log('Database:', rows[0].db);
    console.log('Server time:', rows[0].now);

    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('users', 'auth_activity')
       ORDER BY table_name`
    );
    console.log('Tables:', tables.rows.map((r) => r.table_name).join(', ') || '(run app once to create schema)');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('FAILED:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

main();
