const { Pool } = require('pg');

// In production, verify the DB server's TLS certificate rather than blindly
// trusting it. DATABASE_SSL_INSECURE=true is an emergency escape hatch (set
// via env var, no redeploy needed) in case the provider's cert chain isn't
// recognized by Node's default trust store — DATABASE_CA_CERT lets you pin
// the provider's CA instead of disabling verification entirely.
function sslConfig() {
  if (process.env.NODE_ENV !== 'production') return false;
  if (process.env.DATABASE_SSL_INSECURE === 'true') return { rejectUnauthorized: false };
  return {
    rejectUnauthorized: true,
    ca: process.env.DATABASE_CA_CERT || undefined,
  };
}

const pool = new Pool({
  connectionString:        process.env.DATABASE_URL,
  ssl: sslConfig(),
  max:                     10,
  idleTimeoutMillis:       30000,
  // Fail fast if all connections are in use — prevents unbounded request queuing
  connectionTimeoutMillis: 3000,
});

// Kill any query that runs longer than 8 seconds.
// Prevents a single slow or malicious query from holding a connection
// slot indefinitely and starving the rest of the 10-connection pool.
pool.on('connect', client => {
  client.query('SET statement_timeout = 8000').catch(err =>
    console.error('[db] Failed to set statement_timeout:', err.message)
  );
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

async function testConnection() {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW()');
    console.log('✓ PostgreSQL connected —', res.rows[0].now);
    client.release();
  } catch (err) {
    console.error('✗ Database connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection };
