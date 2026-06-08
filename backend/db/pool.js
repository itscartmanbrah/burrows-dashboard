// PostgreSQL connection pool — connects to the existing burrows_jewellers
// database (the same database populated by the burrows-db-sync project).
// This backend is READ/WRITE for its own app-owned tables, but should treat
// the synced mirror tables (Items, EP_Sales, etc.) as READ-ONLY — they are
// overwritten daily by the sync jobs.

const { Pool } = require('pg');

const pool = new Pool({
  user:     process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host:     process.env.PGHOST,
  port:     parseInt(process.env.PGPORT, 10),
  database: process.env.PGDATABASE,
});

pool.on('error', (err) => {
  console.error(`[${new Date().toISOString()}] Unexpected PG pool error:`, err.message);
});

module.exports = pool;
