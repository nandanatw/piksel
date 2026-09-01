require('dotenv').config();
const { query } = require('../src/db');
const auth = require('../src/auth');

async function main() {
  const stamp = Date.now();
  const email = `retention-smoke-${stamp}@example.invalid`;
  const taskId = `retention_smoke_${stamp}`;
  try {
    await query('INSERT INTO users(email,credits,total_credits,email_verified_at) VALUES($1,0,0,now())', [email]);
    await query("INSERT INTO image_results(task_id,email,result) VALUES($1,$2,$3)", [taskId, email, { taskId, isPublic: true, originalPrompt: 'retention smoke test' }]);
    const token = auth.signJWT({ email, role: 'user', sessionVersion: 0 });
    const response = await fetch(`http://127.0.0.1:3456/api/results/${taskId}`, { method: 'DELETE', headers: { Cookie: `token=${token}` } });
    if (!response.ok) throw new Error(`soft delete returned ${response.status}: ${await response.text()}`);
    const archived = await query("SELECT deleted_at,deleted_by,result->>'isPublic' AS public FROM image_results WHERE task_id=$1", [taskId]);
    if (!archived.rows[0]?.deleted_at || archived.rows[0].deleted_by !== 'user' || archived.rows[0].public !== 'false') throw new Error('result was not retained as a private archive');
    console.log('user deletion retention: ready');
  } finally {
    await query('DELETE FROM image_references WHERE task_id=$1', [taskId]);
    await query('DELETE FROM image_results WHERE task_id=$1', [taskId]);
    await query('DELETE FROM user_activity_log WHERE email=$1', [email]);
    await query('DELETE FROM users WHERE email=$1', [email]);
  }

  const accountEmail = `account-retention-smoke-${stamp}@example.invalid`;
  const accountTaskId = `account_retention_smoke_${stamp}`;
  try {
    await query('INSERT INTO users(email,credits,total_credits,email_verified_at) VALUES($1,0,0,now())', [accountEmail]);
    await query('INSERT INTO image_results(task_id,email,result) VALUES($1,$2,$3)', [accountTaskId, accountEmail, { taskId: accountTaskId, isPublic: true, originalPrompt: 'account retention smoke test' }]);
    const token = auth.signJWT({ email: accountEmail, role: 'user', sessionVersion: 0 });
    const response = await fetch('http://127.0.0.1:3456/api/auth/delete-account', { method: 'DELETE', headers: { Cookie: `token=${token}` } });
    if (!response.ok) throw new Error(`account delete returned ${response.status}: ${await response.text()}`);
    const [user, archived] = await Promise.all([
      query('SELECT email FROM users WHERE email=$1', [accountEmail]),
      query('SELECT deleted_at,owner_deleted_at,deleted_by FROM image_results WHERE task_id=$1', [accountTaskId]),
    ]);
    if (user.rows[0] || !archived.rows[0]?.deleted_at || !archived.rows[0]?.owner_deleted_at) throw new Error('account was not removed with its image retained');
    console.log('account deletion retention: ready');
  } finally {
    await query('DELETE FROM image_results WHERE task_id=$1', [accountTaskId]);
    await query('DELETE FROM user_activity_log WHERE email=$1', [accountEmail]);
    await query('DELETE FROM users WHERE email=$1', [accountEmail]);
  }
  process.exit(0);
}

main().catch(error => { console.error(error.message); process.exit(1); });
