require('dotenv').config();
const { Client } = require('pg');
const crypto = require('crypto');

async function main() {
  const email = process.argv[2] || 'admin@piksel.my.id';
  const password = process.argv[3] || 'Admin1234!';

  const url = new URL(process.env.DATABASE_URL);
  const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false;
  const client = new Client({
    host: url.hostname,
    port: Number(url.port) || 5432,
    user: url.username,
    password: url.password,
    database: url.pathname.replace(/^\//, ''),
    ssl,
  });
  await client.connect();

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const passwordHash = `${salt}:${hash}`;

  const telegram_username = email.split('@')[0];

  const result = await client.query(
    `INSERT INTO users (email, password_hash, telegram_username, display_name, username, credits, total_credits, email_verified_at, unlimited, last_login, free_trial)
     VALUES ($1, $2, $3, $4, $5, 100, 100, now(), true, now(), false)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, email_verified_at = now(), unlimited = true
     RETURNING email, credits, unlimited`,
    [email, passwordHash, telegram_username, 'Piksel Admin', `admin_${Date.now().toString(36).slice(-8)}`]
  );

  console.log('User created:', result.rows[0]);
  console.log('Email:    ', email);
  console.log('Password: ', password);
  console.log('Credits:  100');
  console.log('Unlimited: true (skip payment)');
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
