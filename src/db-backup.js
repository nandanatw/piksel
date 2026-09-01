const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { query } = require('./db');
const { config } = require('./config');

/**
 * Create database backup using pg_dump
 */
async function createDatabaseBackup() {
  const backupId = `db_backup_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const backupsDir = path.join(config.STORAGE_DIR, 'backups');
  
  // Create backups directory if not exists
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  
  const backupPath = path.join(backupsDir, `${backupId}.sql.gz`);
  
  // Parse DATABASE_URL
  let dbUrl;
  try {
    dbUrl = new URL(config.DATABASE_URL);
  } catch (e) {
    throw new Error('Invalid DATABASE_URL format');
  }
  
  const host = dbUrl.hostname;
  const port = dbUrl.port || 5432;
  const database = dbUrl.pathname.slice(1);
  const user = dbUrl.username;
  const password = dbUrl.password;
  
  if (!database || !user) {
    throw new Error('DATABASE_URL missing database name or user');
  }
  
  // Record backup start
  await query(
    'INSERT INTO backup_runs(id, status, created_by) VALUES($1, $2, $3)',
    [backupId, 'running', 'system']
  );
  
  // Build pg_dump command
  const command = password
    ? `PGPASSWORD="${password}" pg_dump -h ${host} -p ${port} -U ${user} -d ${database} | gzip > "${backupPath}"`
    : `pg_dump -h ${host} -p ${port} -U ${user} -d ${database} | gzip > "${backupPath}"`;
  
  // Execute backup asynchronously
  exec(command, async (error, stdout, stderr) => {
    if (error) {
      console.error('Database backup failed:', error.message);
      await query(
        'UPDATE backup_runs SET status=$2, error=$3, finished_at=now() WHERE id=$1',
        [backupId, 'failed', error.message]
      );
      return;
    }
    
    try {
      const stats = fs.statSync(backupPath);
      await query(
        'UPDATE backup_runs SET status=$2, archive_path=$3, byte_size=$4, finished_at=now() WHERE id=$1',
        [backupId, 'completed', backupPath, stats.size]
      );
      console.log(`Database backup completed: ${backupId} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      
      // Verify backup integrity
      await verifyBackup(backupPath, backupId);
    } catch (e) {
      console.error('Database backup post-processing failed:', e.message);
      await query(
        'UPDATE backup_runs SET status=$2, error=$3, finished_at=now() WHERE id=$1',
        [backupId, 'failed', e.message]
      );
    }
  });
  
  return { backupId, status: 'running' };
}

/**
 * Verify backup file integrity
 */
async function verifyBackup(backupPath, backupId) {
  return new Promise((resolve) => {
    exec(`gunzip -t "${backupPath}"`, async (error) => {
      if (error) {
        console.error('Backup verification failed:', error.message);
        await query(
          'UPDATE backup_runs SET error=$2 WHERE id=$1',
          [backupId, 'Backup file may be corrupted: ' + error.message]
        );
      } else {
        console.log(`Backup verified: ${backupId}`);
      }
      resolve();
    });
  });
}

/**
 * Restore database from backup
 * WARNING: This will overwrite the current database
 */
async function restoreDatabase(backupId) {
  const { rows } = await query(
    'SELECT archive_path, status FROM backup_runs WHERE id=$1',
    [backupId]
  );
  
  if (!rows[0]) {
    throw new Error('Backup not found');
  }
  
  if (rows[0].status !== 'completed') {
    throw new Error('Backup is not in completed state');
  }
  
  const backupPath = rows[0].archive_path;
  
  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup file not found on disk');
  }
  
  // Parse DATABASE_URL
  const dbUrl = new URL(config.DATABASE_URL);
  const host = dbUrl.hostname;
  const port = dbUrl.port || 5432;
  const database = dbUrl.pathname.slice(1);
  const user = dbUrl.username;
  const password = dbUrl.password;
  
  // Build psql restore command
  const command = password
    ? `gunzip -c "${backupPath}" | PGPASSWORD="${password}" psql -h ${host} -p ${port} -U ${user} -d ${database}`
    : `gunzip -c "${backupPath}" | psql -h ${host} -p ${port} -U ${user} -d ${database}`;
  
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Database restore failed:', error.message);
        reject(new Error('Database restore failed: ' + error.message));
      } else {
        console.log(`Database restored from backup: ${backupId}`);
        resolve({ ok: true, backupId, message: 'Database restored successfully' });
      }
    });
  });
}

/**
 * Clean up old backups based on retention policy
 */
async function cleanupOldBackups(retentionDays = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  
  const { rows } = await query(
    'SELECT id, archive_path FROM backup_runs WHERE status=$1 AND created_at < $2',
    ['completed', cutoff]
  );
  
  let deleted = 0;
  let failed = 0;
  
  for (const backup of rows) {
    try {
      // Delete file from disk
      if (backup.archive_path && fs.existsSync(backup.archive_path)) {
        fs.unlinkSync(backup.archive_path);
      }
      
      // Delete database record
      await query('DELETE FROM backup_runs WHERE id=$1', [backup.id]);
      deleted++;
    } catch (e) {
      console.error(`Failed to delete backup ${backup.id}:`, e.message);
      failed++;
    }
  }
  
  console.log(`Cleanup completed: ${deleted} backups deleted, ${failed} failed`);
  return { deleted, failed, retention_days: retentionDays };
}

/**
 * Schedule automated backups using cron
 */
function scheduleBackups() {
  try {
    const cron = require('node-cron');
    
    // Daily backup at 3 AM
    cron.schedule('0 3 * * *', async () => {
      console.log('[CRON] Starting automated database backup...');
      try {
        await createDatabaseBackup();
        
        // Also cleanup old backups
        setTimeout(async () => {
          console.log('[CRON] Running backup cleanup...');
          await cleanupOldBackups(30);
        }, 60000); // Wait 1 minute after backup starts
      } catch (e) {
        console.error('[CRON] Automated backup failed:', e.message);
      }
    });
    
    console.log('✓ Automated database backup scheduled (daily at 3 AM)');
  } catch (e) {
    console.error('Failed to schedule automated backups (node-cron not installed?):', e.message);
  }
}

/**
 * Get backup statistics
 */
async function getBackupStats() {
  const { rows } = await query(
    `SELECT 
      COUNT(*) FILTER (WHERE status='completed') AS completed_count,
      COUNT(*) FILTER (WHERE status='failed') AS failed_count,
      COUNT(*) FILTER (WHERE status='running') AS running_count,
      SUM(byte_size) FILTER (WHERE status='completed') AS total_size,
      MAX(created_at) FILTER (WHERE status='completed') AS last_backup
     FROM backup_runs`,
    []
  );
  
  return rows[0] || {};
}

module.exports = {
  createDatabaseBackup,
  restoreDatabase,
  cleanupOldBackups,
  scheduleBackups,
  verifyBackup,
  getBackupStats
};
