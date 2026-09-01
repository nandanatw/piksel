require('dotenv').config();
const auth = require('../src/auth');
const { query } = require('../src/db');

async function main() {
  const login = await fetch('http://127.0.0.1:3456/api/auth/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD, totp: auth.generateTOTP() }),
  });
  if (!login.ok) throw new Error(`Admin login smoke test failed: ${login.status}`);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Admin cookie was not issued');
  const paths = [
    '/api/admin/dashboard', '/api/admin/queue', '/api/admin/audit?page=1&limit=1',
    '/api/admin/payments?page=1&limit=1', '/api/admin/keys/health', '/api/admin/backups',
    '/api/admin/users?page=1&limit=1',
    '/api/admin/user-activity?page=1&limit=1',
    '/api/admin/queue/history?type=completed&limit=1',
    '/api/admin/queue/history?type=failed&limit=1',
    '/api/admin/queue/history?type=cancelled&limit=1',
    '/api/admin/queue/analytics',
    '/api/admin/gallery?page=1&limit=1&deletion=active',
    '/api/admin/gallery?page=1&limit=1&deletion=deleted',
  ];
  for (const path of paths) {
    const response = await fetch('http://127.0.0.1:3456' + path, { headers: { Cookie: cookie } });
    if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
    console.log(`${path}: ${response.status}`);
  }
  const schema = await query(`SELECT
    to_regclass('public.admin_audit_log') AS audit,
    to_regclass('public.email_verification_tokens') AS verification,
    to_regclass('public.payments') AS payments,
    to_regclass('public.backup_runs') AS backups`);
  if (Object.values(schema.rows[0]).some(value => !value)) throw new Error('One or more operations tables are missing');
  console.log('operations schema: ready');
  process.exit(0);
}

main().catch(error => { console.error(error.message); process.exit(1); });
