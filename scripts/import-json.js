require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
const read = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return {}; } };
const readArray = file => { const value = read(file); return Array.isArray(value) ? value : Object.values(value); };

(async () => {
  const backupDir = `backup-json-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.mkdirSync(backupDir, { recursive: true });
  for (const file of ['users.json', 'keypool.json', 'tasks.json', 'results.json']) if (fs.existsSync(file)) fs.copyFileSync(file, `${backupDir}/${file}`);
  console.log(`JSON backup created at ${backupDir}`);
  const users = read('users.json');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const user of Object.values(users)) {
      await client.query(`INSERT INTO users(email,telegram_id,telegram_username,display_name,credits,total_credits,signup_ip,created_at,last_login)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(email) DO NOTHING`, [user.email, user.telegramId || null, user.telegramUsername || '', user.displayName || '', user.credits || 0, user.totalCredits || 0, user.signupIP || null, user.createdAt || new Date(), user.lastLogin || new Date()]);
      for (const tx of (user.transactions || [])) await client.query('INSERT INTO transactions(email,type,amount,reason,time) VALUES($1,$2,$3,$4,$5)', [user.email, tx.type, tx.amount, tx.reason || '', tx.time || new Date()]);
    }
    for (const key of readArray('keypool.json')) if (key.key) await client.query(`INSERT INTO api_keys(email,api_key,balance,exhausted,exhausted_at,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(api_key) DO UPDATE SET balance=EXCLUDED.balance, exhausted=EXCLUDED.exhausted`, [key.email || '', key.key, key.balance || 0, Boolean(key.exhausted), key.exhaustedAt || null, key.createdAt || new Date()]);
    for (const email of new Set(readArray('results.json').map(r => r.user || 'admin').filter(Boolean))) await client.query('INSERT INTO users(email, credits, total_credits) VALUES($1, 0, 0) ON CONFLICT(email) DO NOTHING', [email]);
    for (const [taskId, task] of Object.entries(read('tasks.json'))) await client.query(`INSERT INTO image_tasks(task_id,email,status,prompt,model,ratio,resolution,cost,result,error,created_at,started_at,finished_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(task_id) DO NOTHING`, [taskId, task.email || task.user, task.status || 'error', task.prompt || '', task.model || '', task.ratio || null, task.resolution || null, task.cost || 0, task.result ? JSON.stringify(task.result) : null, task.error || null, task.createdAt || new Date(), task.startedAt || null, task.finishedAt || null]);
    for (const result of readArray('results.json')) if (result.taskId) await client.query(`INSERT INTO image_results(task_id,email,result,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(task_id) DO NOTHING`, [String(result.taskId), result.user || 'admin', JSON.stringify(result), result.timestamp || new Date()]);
    await client.query('COMMIT');
    console.log(`Imported ${Object.keys(users).length} users`);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); await pool.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
