require('dotenv').config();
const auth = require('../src/auth');
const { query } = require('../src/db');

async function loginAdmin() {
  const response = await fetch('http://127.0.0.1:3456/api/auth/admin', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD, totp: auth.generateTOTP() }),
  });
  if (!response.ok) throw new Error(`admin login ${response.status}`);
  return response.headers.get('set-cookie').split(';')[0];
}

async function main() {
  const cookie = await loginAdmin();
  const gallery = await fetch('http://127.0.0.1:3456/api/admin/gallery?page=1&limit=5', { headers: { Cookie: cookie } });
  if (!gallery.ok) throw new Error(`admin gallery ${gallery.status}`);
  const payload = await gallery.json();
  if (!payload.items?.length) throw new Error('admin gallery returned no items');
  for (const item of payload.items) {
    const image = await fetch('http://127.0.0.1:3456' + item.url, { headers: { Cookie: cookie } });
    console.log(item.taskId, image.status, image.headers.get('content-type'), image.headers.get('content-length'));
    if (!image.ok || !String(image.headers.get('content-type')).startsWith('image/')) throw new Error(`bad media ${item.taskId}`);
  }
  const owner = await query('SELECT email, session_version FROM users WHERE email=$1', [payload.items[0].ownerEmail]);
  const userToken = auth.signJWT({ email: owner.rows[0].email, role: 'user', sessionVersion: owner.rows[0].session_version });
  const userResults = await fetch('http://127.0.0.1:3456/api/results', { headers: { Cookie: `token=${userToken}` } });
  if (!userResults.ok) throw new Error(`user gallery ${userResults.status}`);
  const userItems = await userResults.json();
  const ownedItem = userItems.find(item => String(item.taskId) === String(payload.items[0].taskId));
  if (!ownedItem) throw new Error('owner result missing from user gallery');
  const userImage = await fetch('http://127.0.0.1:3456' + ownedItem.url, { headers: { Cookie: `token=${userToken}` } });
  console.log('owner media', ownedItem.taskId, userImage.status, userImage.headers.get('content-type'));
  if (!userImage.ok || !String(userImage.headers.get('content-type')).startsWith('image/')) throw new Error('owner media unavailable');
  const status = await query("SELECT count(*)::int total, count(*) FILTER (WHERE result->>'storagePath' IS NOT NULL)::int stored FROM image_results");
  console.log(status.rows[0]);
  process.exit(0);
}

main().catch(error => { console.error(error.message); process.exit(1); });
