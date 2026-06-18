const fs = require('fs');
const path = require('path');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
const { config } = require('../config/env');

neonConfig.webSocketConstructor = ws;

let pool = null;
let dbConnected = false;
let useMemory = false;
let connectPromise = null;
let lastConnectError = null;

function getPostgresUrl() {
  return config.postgresUrl;
}

function isPostgresConfigured() {
  return Boolean(getPostgresUrl());
}

function isMemoryMode() {
  return useMemory;
}

function isDbConnected() {
  return dbConnected && Boolean(pool);
}

function setMemoryMode(enabled) {
  useMemory = enabled;
  if (enabled) {
    console.warn('[DB] Using in-memory store (data lost on restart). Set POSTGRES_URL for persistence.');
  }
}

function getPool() {
  if (!pool) throw new Error('Database not connected.');
  return pool;
}

async function query(text, params = []) {
  const result = await getPool().query(text, params);
  return result;
}

async function runMigrations() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await getPool().query(statement);
  }
}

async function connectDB() {
  const url = getPostgresUrl();

  if (!url) {
    lastConnectError = 'POSTGRES_URL not set';
    if (config.isProduction && config.isVercel) {
      console.error('[DB] POSTGRES_URL not set on Vercel — using in-memory store.');
    }
    setMemoryMode(true);
    dbConnected = false;
    const { ensureDefaultAdmin } = require('../utils/seedAdmin');
    await ensureDefaultAdmin();
    return false;
  }

  if (dbConnected && pool) return true;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      pool = new Pool({ connectionString: url });

      await pool.query('SELECT 1');
      await runMigrations();

      setMemoryMode(false);
      dbConnected = true;
      lastConnectError = null;
      console.log('[DB] Connected to PostgreSQL (Neon)');

      const { ensureDefaultAdmin } = require('../utils/seedAdmin');
      await ensureDefaultAdmin();
      return true;
    } catch (err) {
      lastConnectError = err.message;
      console.warn('[DB] PostgreSQL unavailable:', err.message);
      if (pool) {
        await pool.end().catch(() => {});
        pool = null;
      }
      setMemoryMode(true);
      dbConnected = false;
      connectPromise = null;
      const { ensureDefaultAdmin } = require('../utils/seedAdmin');
      await ensureDefaultAdmin();
      return false;
    }
  })();

  return connectPromise;
}

function getDbStatus() {
  return {
    mode: useMemory ? 'memory' : 'postgres',
    provider: useMemory ? null : 'neon',
    configured: isPostgresConfigured(),
    connected: isDbConnected(),
    lastError: lastConnectError,
    encryptionAtRest: useMemory ? false : 'neon-managed',
    fieldEncryption: require('../utils/fieldCrypto').isEncryptionConfigured(),
  };
}

module.exports = {
  connectDB,
  query,
  getPool,
  isMemoryMode,
  isDbConnected,
  isPostgresConfigured,
  getDbStatus,
  setMemoryMode,
};
