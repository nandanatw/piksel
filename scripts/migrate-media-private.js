require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query } = require('../src/db');
const { config } = require('../src/config');

async function main() {
  const resultDir = path.join(config.STORAGE_DIR, 'results');
  const refDir = path.join(config.STORAGE_DIR, 'references');
  fs.mkdirSync(resultDir, { recursive: true });
  fs.mkdirSync(refDir, { recursive: true });

  const { rows } = await query('SELECT task_id, email, result FROM image_results');
  let resultsMoved = 0;
  let referencesMoved = 0;
  for (const row of rows) {
    const result = row.result || {};
    if (!result.storagePath && String(result.localUrl || '').startsWith('/images/')) {
      const source = path.join(config.PUBLIC_DIR, result.localUrl.slice(1));
      if (fs.existsSync(source)) {
        const target = path.join(resultDir, path.basename(source));
        fs.copyFileSync(source, target);
        result.storagePath = target;
        result.localUrl = '/api/media/result/' + row.task_id;
        fs.unlinkSync(source);
        resultsMoved++;
      }
    }

    const refs = Array.isArray(result.refUrls) ? result.refUrls : [];
    for (let i = 0; i < refs.length; i++) {
      if (!String(refs[i]).startsWith('/images/refs/')) continue;
      const source = path.join(config.PUBLIC_DIR, refs[i].slice(1));
      if (!fs.existsSync(source)) continue;
      const target = path.join(refDir, `${row.task_id}_${i}${path.extname(source) || '.bin'}`);
      fs.copyFileSync(source, target);
      const stat = fs.statSync(target);
      const { rows: inserted } = await query(
        `INSERT INTO image_references(task_id, owner_email, position, storage_path, original_name, mime_type, byte_size)
         VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(task_id, position) DO UPDATE SET storage_path=EXCLUDED.storage_path RETURNING id`,
        [row.task_id, row.email, i, target, path.basename(source), 'application/octet-stream', stat.size]
      );
      refs[i] = '/api/media/reference/' + inserted[0].id;
      fs.unlinkSync(source);
      referencesMoved++;
    }
    result.refUrls = refs;
    await query('UPDATE image_results SET result=$2 WHERE task_id=$1', [row.task_id, JSON.stringify(result)]);
  }
  console.log(`Private media migration complete: ${resultsMoved} results, ${referencesMoved} references moved.`);
  process.exit(0);
}

main().catch(error => { console.error(error); process.exit(1); });
