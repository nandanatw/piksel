require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });

(async () => {
  const client = await pool.connect();
  try {
    await client.query(fs.readFileSync('schema.sql', 'utf8'));
    console.log('PostgreSQL schema is ready');
  } finally { client.release(); await pool.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
