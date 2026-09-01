#!/usr/bin/env node
// Script to retry downloading images that failed
require('dotenv').config();
const { query } = require('../src/db');
const { generateThumbnail, getImageMetadata } = require('../src/thumbnails');
const fs = require('fs');
const path = require('path');
const { config } = require('../src/config');

async function retryFailedDownloads(limit = 50) {
  // Get images with downloadFailed = true
  const { rows } = await query(
    `SELECT task_id, result FROM image_results 
     WHERE result->>'downloadFailed' = 'true' 
     ORDER BY created_at DESC 
     LIMIT $1`,
    [limit]
  );
  
  let downloaded = 0;
  let failed = 0;
  
  console.log(`Found ${rows.length} failed downloads to retry...`);
  
  for (const row of rows) {
    const taskId = row.task_id;
    const result = row.result;
    const url = result.url || result.imageUrls?.[0];
    
    if (!url) {
      console.log(`❌ ${taskId}: No URL available`);
      failed++;
      continue;
    }
    
    try {
      console.log(`⏳ Downloading ${taskId}...`);
      
      // Download image
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      
      // Save to storage
      const resultDir = path.join(config.STORAGE_DIR, 'results');
      fs.mkdirSync(resultDir, { recursive: true });
      const localFile = taskId + '.png';
      const storagePath = path.join(resultDir, localFile);
      fs.writeFileSync(storagePath, buffer);
      
      // Generate thumbnail
      let thumbnailPath = null;
      try {
        thumbnailPath = await generateThumbnail(storagePath, taskId);
      } catch (thumbError) {
        console.warn(`  ⚠️  Thumbnail failed: ${thumbError.message}`);
      }
      
      // Get metadata
      let metadata = null;
      try {
        metadata = await getImageMetadata(storagePath);
      } catch (metaError) {
        console.warn(`  ⚠️  Metadata failed: ${metaError.message}`);
      }
      
      // Update database
      const updates = {
        ...result,
        storagePath,
        localUrl: '/api/media/result/' + taskId,
        thumbnailPath,
        downloadFailed: false
      };
      
      if (metadata) {
        updates.width = metadata.width;
        updates.height = metadata.height;
        updates.format = metadata.format;
        updates.fileSize = metadata.size;
      }
      
      await query(
        'UPDATE image_results SET result = $1 WHERE task_id = $2',
        [JSON.stringify(updates), taskId]
      );
      
      console.log(`✅ ${taskId}: Downloaded successfully`);
      downloaded++;
      
    } catch (error) {
      console.error(`❌ ${taskId}: ${error.message}`);
      failed++;
    }
  }
  
  return { downloaded, failed, total: rows.length };
}

async function main() {
  const limit = parseInt(process.argv[2]) || 50;
  
  console.log('Retrying failed image downloads...\n');
  
  try {
    const result = await retryFailedDownloads(limit);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Results:');
    console.log(`✓ Downloaded: ${result.downloaded}`);
    console.log(`✗ Failed: ${result.failed}`);
    console.log(`Total: ${result.total}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    process.exit(0);
  } catch (error) {
    console.error('\nError:', error.message);
    process.exit(1);
  }
}

main();
