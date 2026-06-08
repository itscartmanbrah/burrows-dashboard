// PostgreSQL connection pool — connects to the standalone `pandora_reference`
// database. This is a SEPARATE database from burrows_jewellers (no foreign
// keys, no joins, no shared tables) — it exists purely to hold a reference
// copy of Pandora's build-to-level / discontinued master list, imported from
// a CSV the supplier provides periodically. The app owns this database fully
// (read/write).

const { Pool } = require('pg');

const pool = new Pool({
  user:     process.env.PANDORA_PGUSER,
  password: process.env.PANDORA_PGPASSWORD,
  host:     process.env.PANDORA_PGHOST,
  port:     parseInt(process.env.PANDORA_PGPORT, 10),
  database: process.env.PANDORA_PGDATABASE,
});

pool.on('error', (err) => {
  console.error(`[${new Date().toISOString()}] Unexpected pandora_reference pool error:`, err.message);
});

module.exports = pool;
