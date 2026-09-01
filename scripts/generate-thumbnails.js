#!/usr/bin/env node
// Script to generate thumbnails for existing images
require('dotenv').config();
const { batchGenerateThumbnails } = require('../src/thumbnails');

async function main() {
  const limit = parseInt(process.argv[2]) || 100;
  
  console.log(`Generating thumbnails for up to ${limit} images...`);
  
  try {
    const result = await batchGenerateThumbnails(limit);
    
    console.log('\nResults:');
    console.log(`✓ Generated: ${result.generated}`);
    console.log(`✗ Failed: ${result.failed}`);
    console.log(`Total processed: ${result.total}`);
    
    if (result.generated > 0) {
      console.log('\n✓ Thumbnails generated successfully!');
    }
    
    if (result.total === limit) {
      console.log(`\nNote: There might be more images to process. Run again with a higher limit.`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
