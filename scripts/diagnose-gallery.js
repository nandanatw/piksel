require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query } = require('../src/db');
const { config } = require('../src/config');

async function main() {
  const { rows } = await query('SELECT task_id, email, result, created_at FROM image_results ORDER BY created_at DESC LIMIT 20');
  console.log(JSON.stringify(rows.map(row => {
    const result = row.result || {};
    const legacyPath = String(result.localUrl || '').startsWith('/images/') ? path.join(config.PUBLIC_DIR, result.localUrl.slice(1)) : '';
    return {
      taskId: row.task_id,
      email: row.email,
      localUrl: result.localUrl || '',
      providerUrl: result.url || '',
      storagePath: result.storagePath || '',
      storageExists: Boolean(result.storagePath && fs.existsSync(result.storagePath)),
      legacyExists: Boolean(legacyPath && fs.existsSync(legacyPath)),
      isPublic: Boolean(result.isPublic),
    };
  }), null, 2));
  process.exit(0);
}

main().catch(error => { console.error(error); process.exit(1); });
