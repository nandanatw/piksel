require('dotenv').config();
const fs = require('fs');
const { query } = require('../src/db');

async function main() {
  console.log('🔍 Scanning result files...\n');

  const { rows } = await query(
    `SELECT task_id, email, result, created_at, deleted_at
     FROM image_results
     ORDER BY created_at DESC`
  );

  const missingStorage = [];
  const missingThumbnail = [];
  const ok = [];

  for (const row of rows) {
    const result = row.result || {};
    const storagePath = result.storagePath;
    const thumbnailPath = result.thumbnailPath;
    const storageExists = storagePath && fs.existsSync(storagePath);
    const thumbExists = thumbnailPath && fs.existsSync(thumbnailPath);

    if (!storageExists && !thumbExists) {
      missingStorage.push(row);
    } else if (!thumbExists && storageExists) {
      missingThumbnail.push(row);
    } else {
      ok.push(row);
    }
  }

  const deleted = rows.filter(r => r.deleted_at).length;
  const active = rows.length - deleted;

  console.log(`Total records: ${rows.length} (${active} active, ${deleted} deleted)`);
  console.log(`  ✅ OK: ${ok.length}`);
  console.log(`  ❌ Missing storage + thumbnail: ${missingStorage.length}`);
  console.log(`  ⚠️  Missing thumbnail only: ${missingThumbnail.length}`);

  if (missingStorage.length === 0 && missingThumbnail.length === 0) {
    console.log('\n✨ All results are intact. Nothing to clean up.');
    process.exit(0);
  }

  if (missingStorage.length > 0) {
    console.log(`\n📋 Missing files (will be soft-deleted):`);
    for (const row of missingStorage.slice(0, 10)) {
      console.log(`  ${row.task_id} (${row.email})`);
    }
    if (missingStorage.length > 10) console.log(`  ... and ${missingStorage.length - 10} more`);
  }

  if (missingThumbnail.length > 0) {
    console.log(`\n📋 Missing thumbnails only (will clear thumbnail_path):`);
    for (const row of missingThumbnail.slice(0, 5)) {
      console.log(`  ${row.task_id}`);
    }
    if (missingThumbnail.length > 5) console.log(`  ... and ${missingThumbnail.length - 5} more`);
  }

  const autoClean = process.env.CLEANUP_CONFIRM === 'yes';

  if (!autoClean) {
    console.log('\n⏸️  Run with CLEANUP_CONFIRM=yes to execute cleanup:');
    console.log('   CLEANUP_CONFIRM=yes node scripts/cleanup-missing-results.js');
    process.exit(0);
  }

  console.log('\n🧹 Running cleanup...');

  if (missingStorage.length > 0) {
    const ids = missingStorage.map(r => r.task_id);
    await query(
      `UPDATE image_results SET deleted_at = NOW(), deleted_by = 'system-cleanup' WHERE task_id = ANY($1::text[])`,
      [ids]
    );
    console.log(`  ✅ Soft-deleted ${missingStorage.length} results with missing files`);
  }

  if (missingThumbnail.length > 0) {
    const ids = missingThumbnail.map(r => r.task_id);
    await query(
      `UPDATE image_results SET result = result - 'thumbnailPath' WHERE task_id = ANY($1::text[])`,
      [ids]
    );
    console.log(`  ✅ Cleared thumbnail_path for ${missingThumbnail.length} results`);
  }

  console.log('\n✨ Cleanup complete!');
  process.exit(0);
}

main().catch(error => { console.error(error); process.exit(1); });