require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query } = require('../src/db');
const { config } = require('../src/config');

async function main() {
  const resultDir = path.join(config.STORAGE_DIR, 'results');
  fs.mkdirSync(resultDir, { recursive: true });
  const { rows } = await query('SELECT task_id, result FROM image_results ORDER BY created_at');
  let recovered = 0, unavailable = 0, existing = 0;
  for (const row of rows) {
    const result = row.result || {};
    if (result.storagePath && fs.existsSync(result.storagePath)) { existing++; continue; }
    const sourceUrl = result.url;
    if (!sourceUrl) { unavailable++; continue; }
    try {
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      const ext = contentType.includes('jpeg') ? '.jpg' : contentType.includes('webp') ? '.webp' : '.png';
      const target = path.join(resultDir, String(row.task_id).replace(/[^a-zA-Z0-9_-]/g, '_') + ext);
      fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
      result.storagePath = target;
      result.localUrl = '/api/media/result/' + encodeURIComponent(row.task_id);
      await query('UPDATE image_results SET result=$2 WHERE task_id=$1', [row.task_id, JSON.stringify(result)]);
      recovered++;
      console.log(`Recovered ${row.task_id}`);
    } catch (error) {
      unavailable++;
      console.warn(`Unavailable ${row.task_id}: ${error.message}`);
    }
  }
  console.log(JSON.stringify({ recovered, unavailable, existing, total: rows.length }));
  process.exit(unavailable > 0 && recovered === 0 ? 1 : 0);
}

main().catch(error => { console.error(error); process.exit(1); });
