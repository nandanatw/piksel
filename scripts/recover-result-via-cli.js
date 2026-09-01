require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { query } = require('../src/db');
const { config } = require('../src/config');

function runCLI(taskId, apiKey) {
  return new Promise((resolve, reject) => execFile(
    config.RENOISE_CLI_PATH,
    ['task', 'result', String(taskId), '--json'],
    { env: { ...process.env, RENOISE_API_KEY: apiKey }, timeout: 120000 },
    (error, stdout, stderr) => error ? reject(new Error(stderr || stdout || error.message)) : resolve(stdout)
  ));
}

function findUrl(payload) {
  const urls = payload?.result?.imageUrls || payload?.task?.result?.imageUrls || payload?.imageUrls || [];
  return payload?.result?.url || payload?.task?.result?.url || payload?.url || urls[0] || null;
}

async function main() {
  const resultDir = path.join(config.STORAGE_DIR, 'results');
  fs.mkdirSync(resultDir, { recursive: true });
  const { rows } = await query('SELECT task_id, result FROM image_results ORDER BY created_at');
  const keys = await query('SELECT email, api_key FROM api_keys');
  const keyByEmail = new Map(keys.rows.map(row => [row.email, row.api_key]));
  let recovered = 0, unavailable = 0, existing = 0;

  for (const row of rows) {
    const result = row.result || {};
    if (result.storagePath && fs.existsSync(result.storagePath)) { existing++; continue; }
    const apiKey = keyByEmail.get(result.usedKey);
    const providerTaskId = result.providerTaskId || result.taskId || row.task_id;
    if (!apiKey || !providerTaskId) { unavailable++; console.warn(`Missing key/task for ${row.task_id}`); continue; }
    try {
      const payload = JSON.parse(await runCLI(providerTaskId, apiKey));
      const sourceUrl = findUrl(payload);
      if (!sourceUrl) throw new Error('CLI returned no image URL');
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error(`download HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      const ext = contentType.includes('jpeg') ? '.jpg' : contentType.includes('webp') ? '.webp' : '.png';
      const target = path.join(resultDir, String(row.task_id).replace(/[^a-zA-Z0-9_-]/g, '_') + ext);
      fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
      result.providerTaskId = providerTaskId;
      result.storagePath = target;
      result.localUrl = '/api/media/result/' + encodeURIComponent(row.task_id);
      await query('UPDATE image_results SET result=$2 WHERE task_id=$1', [row.task_id, JSON.stringify(result)]);
      recovered++;
      console.log(`Recovered ${row.task_id}`);
    } catch (error) {
      unavailable++;
      console.warn(`Unavailable ${row.task_id}: ${String(error.message).slice(0, 200)}`);
    }
  }
  console.log(JSON.stringify({ recovered, unavailable, existing, total: rows.length }));
  process.exit(unavailable > 0 && recovered === 0 ? 1 : 0);
}

main().catch(error => { console.error(error); process.exit(1); });
