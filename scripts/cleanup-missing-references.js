require('dotenv').config();
const fs = require('fs');
const { query } = require('../src/db');

async function main() {
  console.log('🔍 Scanning reference files...\n');

  const { rows } = await query(
    `SELECT id, owner_email, original_name, storage_path, thumbnail_path, deleted_at
     FROM image_references
     ORDER BY id`
  );

  const missingStorage = [];
  const missingThumbnail = [];
  const ok = [];

  for (const row of rows) {
    const storageExists = row.storage_path && fs.existsSync(row.storage_path);
    const thumbExists = row.thumbnail_path && fs.existsSync(row.thumbnail_path);

    if (!storageExists) {
      missingStorage.push(row);
    } else if (!thumbExists) {
      missingThumbnail.push(row);
    } else {
      ok.push(row);
    }
  }

  console.log(`Total records: ${rows.length}`);
  console.log(`  ✅ OK (file + thumbnail): ${ok.length}`);
  console.log(`  ❌ Missing storage file: ${missingStorage.length}`);
  console.log(`  ⚠️  Missing thumbnail only: ${missingThumbnail.length}`);
  console.log(`  🗑️  Already soft-deleted: ${rows.filter(r => r.deleted_at).length}`);

  if (missingStorage.length === 0 && missingThumbnail.length === 0) {
    console.log('\n✨ All references are intact. Nothing to clean up.');
    process.exit(0);
  }

  if (missingStorage.length > 0) {
    console.log(`\n📋 Records with MISSING storage files (will be soft-deleted):`);
    for (const row of missingStorage.slice(0, 10)) {
      console.log(`  ID ${row.id}: ${row.original_name} (${row.owner_email})`);
    }
    if (missingStorage.length > 10) console.log(`  ... and ${missingStorage.length - 10} more`);
  }

  if (missingThumbnail.length > 0) {
    console.log(`\n📋 Records with MISSING thumbnails only (will regenerate):`);
    for (const row of missingThumbnail.slice(0, 5)) {
      console.log(`  ID ${row.id}: ${row.original_name}`);
    }
    if (missingThumbnail.length > 5) console.log(`  ... and ${missingThumbnail.length - 5} more`);
  }

  // Ask for confirmation via env flag
  const autoClean = process.env.CLEANUP_CONFIRM === 'yes';

  if (!autoClean) {
    console.log('\n⏸️  Run with CLEANUP_CONFIRM=yes to execute cleanup:');
    console.log('   CLEANUP_CONFIRM=yes node scripts/cleanup-missing-references.js');
    process.exit(0);
  }

  console.log('\n🧹 Running cleanup...');

  // Soft-delete records with missing storage files
  if (missingStorage.length > 0) {
    const ids = missingStorage.map(r => r.id);
    await query(
      `UPDATE image_references SET deleted_at = NOW(), deleted_by = 'system-cleanup' WHERE id = ANY($1::int[])`,
      [ids]
    );
    console.log(`  ✅ Soft-deleted ${missingStorage.length} records with missing files`);
  }

  // Clear thumbnail_path for records with missing thumbnails (will be regenerated on next use)
  if (missingThumbnail.length > 0) {
    const ids = missingThumbnail.map(r => r.id);
    await query(
      `UPDATE image_references SET thumbnail_path = NULL WHERE id = ANY($1::int[])`,
      [ids]
    );
    console.log(`  ✅ Cleared thumbnail_path for ${missingThumbnail.length} records`);
  }

  console.log('\n✨ Cleanup complete!');
  process.exit(0);
}

main().catch(error => { console.error(error); process.exit(1); });