const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { config } = require('./config');

/** Apply a branded watermark to an output image in-place via a temporary file. */
async function applyWatermark(originalPath, text = config.FREE_WATERMARK_TEXT) {
  if (!fs.existsSync(originalPath)) throw new Error('Original image not found: ' + originalPath);
  const metadata = await sharp(originalPath).metadata();
  const imageWidth = Number(metadata.width || 1024);
  const imageHeight = Number(metadata.height || 1024);
  const shortSide = Math.min(imageWidth, imageHeight);
  const centerX = imageWidth / 2;
  const centerY = imageHeight / 2;

  // Single large centered watermark, tilted diagonally. High transparency keeps
  // the subject readable so the result is not distracting, while the mark stays
  // legible. The first line is the brand, the following lines (e.g. the URL) are
  // rendered smaller beneath it.
  const safeLines = String(text)
    .split(/\r?\n/)
    .map(line => line.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char])))
    .filter(Boolean);
  const lines = safeLines.length ? safeLines : ['Piksel'];

  // Size the primary line to a balanced share of the shorter side: visible and
  // legible without dominating the image. Secondary lines are smaller.
  const primaryFont = Math.max(24, Math.min(88, Math.round(shortSide * 0.072)));
  const secondaryFont = Math.round(primaryFont * 0.42);
  const lineGap = Math.round(primaryFont * 1.1);
  const opacity = 0.16;

  const tspans = lines
    .map((line, index) => {
      const size = index === 0 ? primaryFont : secondaryFont;
      const dy = index === 0 ? 0 : (index === 1 ? Math.round(primaryFont * 0.85) : lineGap);
      return `<tspan x="${centerX}" dy="${dy}" font-size="${size}" font-weight="${index === 0 ? 700 : 500}" letter-spacing="${index === 0 ? 2 : 1}">${line}</tspan>`;
    })
    .join('');

  // A soft stroke keeps the mark visible on both light and dark areas without
  // needing higher opacity.
  const svg = `<svg width="${imageWidth}" height="${imageHeight}" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(-30 ${centerX} ${centerY})">
      <text x="${centerX}" y="${centerY}" text-anchor="middle" dominant-baseline="middle"
            font-family="Arial,Helvetica,sans-serif" fill="white" fill-opacity="${opacity}"
            stroke="black" stroke-opacity="${opacity * 0.5}" stroke-width="1" paint-order="stroke">${tspans}</text>
    </g>
  </svg>`;

  const temporaryPath = `${originalPath}.watermarked-${process.pid}-${Date.now()}.tmp`;
  try {
    await sharp(originalPath).composite([{ input: Buffer.from(svg) }]).png().toFile(temporaryPath);
    fs.renameSync(temporaryPath, originalPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
  return originalPath;
}

/**
 * Generate thumbnail from original image
 * @param {string} originalPath - Path to original image
 * @param {string} taskId - Task ID for naming
 * @param {number} size - Thumbnail size (default 400px)
 * @returns {Promise<string>} Path to generated thumbnail
 */
async function generateThumbnail(originalPath, taskId, size = 400) {
  if (!fs.existsSync(originalPath)) {
    throw new Error('Original image not found: ' + originalPath);
  }

  const thumbnailDir = path.join(config.STORAGE_DIR, 'thumbnails');
  fs.mkdirSync(thumbnailDir, { recursive: true });
  
  const thumbnailPath = path.join(thumbnailDir, `${taskId}_thumb.webp`);
  
  // Skip if already exists
  if (fs.existsSync(thumbnailPath)) {
    return thumbnailPath;
  }
  
  try {
    await sharp(originalPath)
      .resize(size, size, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .webp({ quality: 80 })
      .toFile(thumbnailPath);
    
    return thumbnailPath;
  } catch (error) {
    console.error('Thumbnail generation failed:', error.message);
    throw error;
  }
}

/**
 * Generate thumbnail for reference image
 * @param {string} originalPath - Path to original reference image
 * @param {string} referenceId - Reference ID for naming
 * @returns {Promise<string>} Path to generated thumbnail
 */
async function generateReferenceThumbnail(originalPath, referenceId) {
  if (!fs.existsSync(originalPath)) {
    throw new Error('Original reference image not found: ' + originalPath);
  }

  const thumbnailDir = path.join(config.STORAGE_DIR, 'thumbnails', 'references');
  fs.mkdirSync(thumbnailDir, { recursive: true });
  
  const thumbnailPath = path.join(thumbnailDir, `${referenceId}_thumb.webp`);
  
  // Skip if already exists
  if (fs.existsSync(thumbnailPath)) {
    return thumbnailPath;
  }
  
  try {
    await sharp(originalPath)
      .resize(200, 200, { 
        fit: 'cover'
      })
      .webp({ quality: 75 })
      .toFile(thumbnailPath);
    
    return thumbnailPath;
  } catch (error) {
    console.error('Reference thumbnail generation failed:', error.message);
    throw error;
  }
}

/**
 * Get image metadata
 * @param {string} imagePath - Path to image
 * @returns {Promise<object>} Image metadata (width, height, format, size)
 */
async function getImageMetadata(imagePath) {
  if (!fs.existsSync(imagePath)) {
    return null;
  }

  try {
    const metadata = await sharp(imagePath).metadata();
    const stats = fs.statSync(imagePath);
    
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: stats.size
    };
  } catch (error) {
    console.error('Failed to get image metadata:', error.message);
    return null;
  }
}

/**
 * Batch generate thumbnails for existing images
 * @param {number} limit - Max number to process
 */
async function batchGenerateThumbnails(limit = 100) {
  const { query } = require('./db');
  
  // Get images without thumbnails
  const { rows } = await query(
    `SELECT task_id, result FROM image_results 
     WHERE result->>'thumbnailPath' IS NULL 
     ORDER BY created_at DESC 
     LIMIT $1`,
    [limit]
  );
  
  let generated = 0;
  let failed = 0;
  
  for (const row of rows) {
    const storagePath = row.result?.storagePath;
    if (!storagePath || !fs.existsSync(storagePath)) {
      failed++;
      continue;
    }
    
    try {
      const thumbnailPath = await generateThumbnail(storagePath, row.task_id);
      
      // Update database
      await query(
        `UPDATE image_results 
         SET result = jsonb_set(result, '{thumbnailPath}', $2::jsonb) 
         WHERE task_id = $1`,
        [row.task_id, JSON.stringify(thumbnailPath)]
      );
      
      generated++;
    } catch (error) {
      console.error(`Failed to generate thumbnail for ${row.task_id}:`, error.message);
      failed++;
    }
  }
  
  return { generated, failed, total: rows.length };
}

module.exports = {
  generateThumbnail,
  generateReferenceThumbnail,
  getImageMetadata,
  applyWatermark,
  batchGenerateThumbnails
};
