const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { query } = require('./db');
const { config, IMAGE_MODELS, FALLBACK_COSTS } = require('./config');
const { runCLI, listKeys, refreshCredits, selectBestKey, releaseKey, consumeBalance, markExhausted } = require('./pool');
const { generateThumbnail, generateReferenceThumbnail, getImageMetadata, applyWatermark } = require('./thumbnails');
const userActivity = require('./user-activity');

const pendingTasks = new Map();
const generationQueue = [];
// Provider API keys and AbortControllers are memory-only. Only the provider
// task ID and non-secret key ID are persisted for audit/debugging.
const providerControls = new Map();
// Coalesce local reference persistence for sibling tasks in one user request.
// Provider uploads deliberately remain per task/API key so moderation, key
// rotation, and retry behavior are unchanged.
const batchReferencePromises = new Map();
let activeGenerations = 0;
let costCache = {};

// BUG-4 fix: Clean up completed tasks older than 1 hour to prevent memory leak
setInterval(() => {
  const cutoff = Date.now() - 3600000; // 1 hour
  let cleaned = 0;
  for (const [id, task] of pendingTasks) {
    if (task.status === 'done' || task.status === 'error') {
      const taskTime = task.startedAt ? new Date(task.startedAt).getTime() : task.createdAt ? new Date(task.createdAt).getTime() : 0;
      if (taskTime < cutoff) {
        pendingTasks.delete(id);
        cleaned++;
      }
    }
  }
  if (cleaned > 0) console.log(`Cleaned ${cleaned} completed tasks from memory`);
}, 600000); // every 10 min

let maxConcurrentGenerations = config.MAX_CONCURRENT_GENERATIONS;
let maxQueuedGenerations = config.MAX_QUEUED_GENERATIONS;
const maxUserGenerations = config.MAX_USER_GENERATIONS;
let queuePaused = false;

function enhancePrompt(prompt) {
  const enhancements = [
    'high quality, detailed, professional lighting, 8k, sharp focus',
    'cinematic, dramatic lighting, photorealistic, ultra detailed',
    'vibrant colors, stunning composition, masterpiece, best quality',
    'professional photography, studio lighting, sharp details, 4k',
  ];
  const random = enhancements[Math.floor(Math.random() * enhancements.length)];
  return prompt + ', ' + random;
}

function getModels() {
  const source = Object.keys(costCache).length > 0 ? costCache : IMAGE_MODELS;
  return Object.fromEntries(Object.entries(source).map(([id, info]) => [
    id,
    { ...info, cost: getModelCost(id) },
  ]));
}

function getModelCost(model) {
  const cached = costCache[model];
  if (cached && typeof cached.cost === 'number') return cached.cost;
  return FALLBACK_COSTS[model] || 6;
}

async function loadCosts() {
  const pool = await listKeys();
  const availKey = pool.find(k => k.key);
  if (!availKey) return;
  const models = {};
  for (const [id, info] of Object.entries(IMAGE_MODELS)) {
    models[id] = { ...info };
    try {
      const out = await runCLI(['task', 'cost', id, '--json'], { RENOISE_API_KEY: availKey.key });
      const data = JSON.parse(out);
      models[id].cost = data.estimatedCredit || FALLBACK_COSTS[id] || 6;
    } catch (e) {
      models[id].cost = FALLBACK_COSTS[id] || 6;
    }
  }
  costCache = models;
  console.log('Costs loaded:', Object.entries(costCache).map(([k, v]) => k + '=' + v.cost).join(', '));
}

async function saveTask(taskId, task) {
  const result = task.status === 'done' ? JSON.stringify(task) : null;
  await query(
    `INSERT INTO image_tasks(task_id, email, status, prompt, model, ratio, resolution, cost, result, error, created_at, started_at, finished_at, batch_id, batch_position)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT(task_id) DO UPDATE SET
       status = EXCLUDED.status,
       batch_id = COALESCE(EXCLUDED.batch_id, image_tasks.batch_id),
       batch_position = COALESCE(EXCLUDED.batch_position, image_tasks.batch_position),
       result = COALESCE(EXCLUDED.result, image_tasks.result),
       error = EXCLUDED.error,
       started_at = COALESCE(EXCLUDED.started_at, image_tasks.started_at),
       finished_at = EXCLUDED.finished_at,
       actual_completion = EXCLUDED.finished_at,
       processing_duration = CASE WHEN EXCLUDED.finished_at IS NOT NULL
         THEN GREATEST(0, EXTRACT(EPOCH FROM (EXCLUDED.finished_at - COALESCE(EXCLUDED.started_at, image_tasks.started_at, image_tasks.created_at)))::int)
         ELSE image_tasks.processing_duration END`,
    [
      taskId,
      task.email || task.user || '',
      task.status,
      task.prompt || '',
      task.model || '',
      task.ratio || null,
      task.resolution || null,
      task.cost || 0,
      result,
      task.error || null,
      task.createdAt ? new Date(task.createdAt) : new Date(),
      task.startedAt ? new Date(task.startedAt) : null,
      (task.status === 'done' || task.status === 'error' || task.status === 'cancelled') ? new Date() : null,
      task.batchId || null,
      Number.isInteger(task.batchPosition) ? task.batchPosition : null,
    ]
  );
}

async function loadTasks() {
  const { rows } = await query("SELECT * FROM image_tasks WHERE status IN ('running', 'queued')");
  for (const t of rows) {
    const r = await query(
      "UPDATE image_tasks SET status='error',error=$2,finished_at=now(),actual_completion=now(),processing_duration=GREATEST(0,EXTRACT(EPOCH FROM (now()-COALESCE(started_at,created_at)))::int) WHERE task_id=$1 AND status IN ('running','queued') RETURNING task_id,email,cost,model",
      [t.task_id, 'Generation interrupted by server restart']
    );
    if (r.rows[0]) {
      pendingTasks.set(t.task_id, { taskId: t.task_id, batchId: t.batch_id || null, batchPosition: t.batch_position, status: 'error', error: 'Generation interrupted by server restart', email: t.email, cost: t.cost });
      if (t.email && t.cost > 0) await refundTaskOnce(t.task_id, 'restart_refund');
      await userActivity.logActivity(t.email, 'generation.failed', null, { taskId: t.task_id, model: t.model, error: 'Generation interrupted by server restart', cost: t.cost || 0 });
    }
  }
  if (pendingTasks.size > 0) console.log(`Recovered ${pendingTasks.size} interrupted tasks`);
}

// Get all active tasks from DB (unified source for admin & user)
async function getActiveTasks() {
  const { rows } = await query(
    "SELECT task_id AS \"taskId\", batch_id AS \"batchId\", batch_position AS \"batchPosition\", email, status, prompt, model, ratio, resolution, cost, created_at AS \"createdAt\", started_at AS \"startedAt\" FROM image_tasks WHERE status IN ('queued','running') ORDER BY created_at ASC"
  );
  return rows.map(row => ({ 
    id: row.taskId, 
    taskId: row.taskId, 
    batchId: row.batchId,
    batchPosition: row.batchPosition,
    email: row.email,
    status: row.status, 
    prompt: row.prompt, 
    model: row.model, 
    ratio: row.ratio, 
    resolution: row.resolution, 
    cost: row.cost,
    createdAt: row.createdAt,
    startedAt: row.startedAt
  }));
}

function activeTasksForUser(email) {
  return [...pendingTasks.values()].filter(task => task.email === email && (task.status === 'queued' || task.status === 'running')).length;
}

async function saveResult(result, email, resultTaskId = result.taskId, batchId = result.batchId || null, batchPosition = result.batchPosition ?? null) {
  await query(
    `INSERT INTO image_results(task_id, email, result, created_at, batch_id, batch_position)
     VALUES($1, $2, $3, $4, $5, $6)
     ON CONFLICT(task_id) DO UPDATE SET
       result = EXCLUDED.result,
       batch_id = COALESCE(EXCLUDED.batch_id, image_results.batch_id),
       batch_position = COALESCE(EXCLUDED.batch_position, image_results.batch_position)`,
    [String(resultTaskId), email, JSON.stringify(result), new Date(result.timestamp || Date.now()), batchId, Number.isInteger(batchPosition) ? batchPosition : null]
  );
}

async function listResults() {
  const { rows } = await query('SELECT * FROM image_results WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1000');
  return rows.map(row => ({ ...row.result, taskId: row.task_id, batchId: row.batch_id || row.result?.batchId, batchPosition: row.batch_position ?? row.result?.batchPosition, user: row.email, timestamp: row.result.timestamp || row.created_at }));
}

async function archiveResult(taskId, email, deletedBy = 'user') {
  const { rows } = await query(
    "UPDATE image_results SET deleted_at=COALESCE(deleted_at,now()),deleted_by=$3,is_favorite=false,result=jsonb_set(result,'{isPublic}','false'::jsonb,true) WHERE task_id=$1 AND email=$2 RETURNING task_id",
    [String(taskId), email, deletedBy]
  );
  return Boolean(rows[0]);
}

async function deleteResult(taskId) {
  const { rows } = await query('DELETE FROM image_results WHERE task_id = $1 RETURNING result', [String(taskId)]);
  return rows[0]?.result || null;
}

async function activeTasksForUserFromDb(email) {
  const { rows } = await query("SELECT task_id AS \"taskId\", batch_id AS \"batchId\", batch_position AS \"batchPosition\", status, prompt, model, ratio, resolution, cost, created_at AS \"createdAt\", started_at AS \"startedAt\" FROM image_tasks WHERE email=$1 AND status IN ('queued','running') ORDER BY created_at ASC", [email]);
  return rows.map(row => ({ id: row.taskId, taskId: row.taskId, batchId: row.batchId, batchPosition: row.batchPosition, status: row.status, prompt: row.prompt, model: row.model, ratio: row.ratio, resolution: row.resolution, cost: row.cost, createdAt: row.createdAt, startedAt: row.startedAt }));
}

function cancelledError() {
  return Object.assign(new Error('Cancellation requested'), { cancelled: true, terminal: true });
}

async function cancelProviderTask(localTaskId) {
  const control = providerControls.get(localTaskId);
  if (!control) return { attempted: false, cancelled: false, reason: 'provider_task_not_registered' };
  if (control.cancelPromise) return control.cancelPromise;

  control.cancelPromise = (async () => {
    await query('UPDATE image_tasks SET provider_cancel_requested_at=COALESCE(provider_cancel_requested_at,now()),provider_cancel_error=NULL WHERE task_id=$1', [localTaskId]);
    try {
      const output = await runCLI(
        ['task', 'cancel', String(control.providerTaskId), '--json'],
        { RENOISE_API_KEY: control.apiKey },
        { timeout: 15000 }
      );
      let payload = null;
      try { payload = JSON.parse(output); } catch (_) {}
      if (payload?.error) throw new Error(typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.error));
      await query('UPDATE image_tasks SET provider_cancelled_at=now(),provider_cancel_error=NULL WHERE task_id=$1', [localTaskId]);
      control.waitController.abort();
      return { attempted: true, cancelled: true };
    } catch (error) {
      const message = String(error.message || error).slice(0, 500);
      await query('UPDATE image_tasks SET provider_cancel_error=$2 WHERE task_id=$1', [localTaskId, message]);
      return { attempted: true, cancelled: false, reason: message };
    }
  })();
  return control.cancelPromise;
}

async function generateImageRotate(prompt, model, ratio, resolution, refFiles, localTaskId = null) {
  const pool = await refreshCredits();
  const modelInfo = IMAGE_MODELS[model] || IMAGE_MODELS['flux-schnell'];
  const useRatio = ratio || modelInfo.defaultRatio;
  const useRes = resolution || modelInfo.defaultRes;
  const estimatedCost = getModelCost(model);

  const errors = [];
  const tried = new Set();
  const deadlineAt = Date.now() + config.GENERATION_TOTAL_TIMEOUT_MS;
  const maxAttempts = Math.max(1, config.MAX_KEY_RETRIES);

  while (tried.size < pool.filter(k => !k.exhausted && k.key).length && tried.size < maxAttempts) {
    if (Date.now() >= deadlineAt) throw new Error('Generation timed out after 12 minutes');
    const entry = selectBestKey(pool, estimatedCost, tried);
    if (!entry) break;
    tried.add(entry.key);

    try {
      try {
        let materialIds = [];
        if (refFiles && refFiles.length > 0) {
          for (const file of refFiles) {
            let uploaded = false
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                const uploadTimeout = Math.max(15000, Math.min(120000, deadlineAt - Date.now()))
                const out = await runCLI(['upload', file.path, '--json'], { RENOISE_API_KEY: entry.key }, { timeout: uploadTimeout })
                const data = JSON.parse(out)
                if (data.material?.id) {
                  materialIds.push(data.material.id + ':reference_image')
                  uploaded = true
                  break
                }
                if (data.error) throw new Error(JSON.stringify(data.error))
              } catch (uploadErr) {
                if (attempt === 2) throw uploadErr
                await new Promise(r => setTimeout(r, 2000))
              }
            }
            if (!uploaded) throw new Error('Upload failed after 3 attempts')
          }
        }

        const args = ['task', 'create', '--model', model, '--type', 'image', '--prompt', prompt, '--ratio', useRatio, '--json'];
        if (useRes) args.push('--resolution', useRes);
        if (materialIds.length > 0) args.push('--materials', materialIds.join(','));
        if (localTaskId && pendingTasks.get(localTaskId)?.cancelRequested) throw cancelledError();

        const createOut = await runCLI(args, { RENOISE_API_KEY: entry.key }, { timeout: 30000 }); // 30s timeout for create
        const createData = JSON.parse(createOut);
        if (createData.error) {
          const msg = JSON.stringify(createData.error);
          if (/credit|balance|insufficient|quota|exhausted|limit/i.test(msg)) {
            entry.exhausted = true; entry.balance = 0; entry.exhaustedAt = new Date().toISOString();
            await markExhausted(entry.key);
            errors.push('key_' + entry.id + ': EXHAUSTED');
            continue;
          }
          errors.push('key_' + entry.id + ': ' + msg);
          continue;
        }
        const providerTaskId = createData.task.id;
        const actualCost = createData.task.estimatedCredit || estimatedCost;
        const waitController = new AbortController();
        if (localTaskId) {
          providerControls.set(localTaskId, { providerTaskId, apiKey: entry.key, apiKeyId: entry.id, waitController, cancelPromise: null });
          await query(
            'UPDATE image_tasks SET provider_task_id=$2,provider_key_id=$3,provider_cancel_error=NULL WHERE task_id=$1',
            [localTaskId, String(providerTaskId), entry.id]
          );
          if (pendingTasks.get(localTaskId)?.cancelRequested) {
            const cancellation = await cancelProviderTask(localTaskId);
            if (cancellation.cancelled) {
              providerControls.delete(localTaskId);
              throw cancelledError();
            }
          }
        }
        
        // Use Modal HTTP endpoint polling with configurable timeout
        try {
          const waitTimeout = Math.max(1000, Math.min(360000, deadlineAt - Date.now()));
          await runCLI(
            ['task', 'wait', String(providerTaskId), '--timeout', '5m', '--json'], 
            { RENOISE_API_KEY: entry.key },
            { timeout: waitTimeout, signal: waitController.signal }
          );
          if (localTaskId && pendingTasks.get(localTaskId)?.cancelRequested) throw cancelledError();
          
          const resultOut = await runCLI(['task', 'result', String(providerTaskId), '--json'], { RENOISE_API_KEY: entry.key }, { timeout: 30000 });
          const resultData = JSON.parse(resultOut);
          entry.balance = await consumeBalance(entry.key, actualCost);
          if (entry.balance <= 0) { entry.exhausted = true; entry.exhaustedAt = new Date().toISOString(); }
          return {
            url: resultData.imageUrl || '',
            imageUrls: resultData.imageUrls || [],
            taskId: providerTaskId, prompt, model, ratio: useRatio, resolution: useRes,
            usedKey: 'key_' + entry.id, keyIndex: pool.indexOf(entry) + 1,
            estimatedCredit: actualCost, remainingBalance: entry.balance,
          };
        } catch (waitErr) {
          if (localTaskId && pendingTasks.get(localTaskId)?.cancelRequested) throw cancelledError();
          if (Date.now() >= deadlineAt) throw new Error('Generation timed out after 12 minutes');
          errors.push('key_' + entry.id + ': ' + waitErr.message);
          continue;
        } finally {
          const currentControl = localTaskId ? providerControls.get(localTaskId) : null;
          if (currentControl?.providerTaskId === providerTaskId) providerControls.delete(localTaskId);
        }
      } catch (e) {
        if (e.terminal) throw e;
        const msg = e.message || String(e);
        if (/credit|balance|insufficient|quota|exhausted|limit/i.test(msg)) {
          entry.exhausted = true; entry.balance = 0; entry.exhaustedAt = new Date().toISOString();
          await markExhausted(entry.key);
          errors.push('key_' + entry.id + ': EXHAUSTED');
          continue;
        }
        errors.push('key_' + entry.id + ': ' + msg);
        continue;
      }
    } finally {
      releaseKey(entry.key, estimatedCost);
    }
  }
  throw new Error(errors.join(' | ') || 'All keys exhausted');
}

function runNextGeneration() {
  if (queuePaused) return;
  while (activeGenerations < maxConcurrentGenerations && generationQueue.length > 0) {
    const job = generationQueue.shift();
    const task = pendingTasks.get(job.taskId);
    if (!task || task.status !== 'queued') continue;
    activeGenerations++;
    pendingTasks.set(job.taskId, { ...task, status: 'running', startedAt: new Date().toISOString() });
    saveTask(job.taskId, pendingTasks.get(job.taskId)).catch(err => console.error('Failed to persist running task:', err.message));
    processTask(job.taskId, job.prompt, job.model, job.ratio, job.resolution, job.refFiles, job.email, job.batchId)
      .finally(() => {
        activeGenerations--;
        runNextGeneration();
      });
  }
}

function enqueueGeneration(job) {
  if (generationQueue.length >= maxQueuedGenerations) return false;
  generationQueue.push(job);
  queueMicrotask(runNextGeneration);
  return true;
}

function getQueueLength() {
  return generationQueue.length;
}

async function loadQueueConfig() {
  const { rows } = await query('SELECT paused,max_concurrent,max_queued FROM queue_config WHERE id=1');
  if (rows[0]) applyQueueConfig(rows[0]);
  return queueSnapshot();
}

function applyQueueConfig(values = {}) {
  if (values.paused !== undefined) queuePaused = Boolean(values.paused);
  const concurrent = Number(values.maxConcurrent ?? values.max_concurrent);
  const queued = Number(values.maxQueued ?? values.max_queued);
  if (Number.isInteger(concurrent) && concurrent >= 1 && concurrent <= 50) maxConcurrentGenerations = concurrent;
  if (Number.isInteger(queued) && queued >= 1 && queued <= 1000) maxQueuedGenerations = queued;
  if (!queuePaused) queueMicrotask(runNextGeneration);
  return queueSnapshot();
}

function prioritizeTask(taskId) {
  const index = generationQueue.findIndex(job => job.taskId === taskId);
  if (index < 0) return false;
  const [job] = generationQueue.splice(index, 1);
  generationQueue.unshift(job);
  return true;
}

async function persistBatchReferences(batchId, taskId, refFiles, email) {
  if (!refFiles || refFiles.length === 0) return [];
  const referenceKey = batchId || taskId;
  if (batchReferencePromises.has(referenceKey)) return batchReferencePromises.get(referenceKey);

  const promise = (async () => {
    const existing = batchId
      ? await query('SELECT id FROM image_references WHERE batch_id=$1 AND deleted_at IS NULL ORDER BY position', [batchId])
      : { rows: [] };
    if (existing.rows.length > 0) return existing.rows.map(row => '/api/media/reference/' + row.id);

    const refDir = path.join(config.STORAGE_DIR, 'references');
    fs.mkdirSync(refDir, { recursive: true });
    const refUrls = [];
    for (let i = 0; i < refFiles.length; i++) {
      try {
        const fileBuffer = fs.readFileSync(refFiles[i].path);
        const contentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        const dup = await query(
          'SELECT id, storage_path, thumbnail_path FROM image_references WHERE owner_email=$1 AND content_hash=$2 AND deleted_at IS NULL LIMIT 1',
          [email, contentHash]
        );
        if (dup.rows.length > 0) {
          const refId = dup.rows[0].id;
          await query(
            `INSERT INTO image_references(task_id, batch_id, owner_email, position, storage_path, original_name, mime_type, byte_size, content_hash, thumbnail_path)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT(batch_id, position) WHERE batch_id IS NOT NULL
             DO UPDATE SET storage_path=EXCLUDED.storage_path, original_name=EXCLUDED.original_name, mime_type=EXCLUDED.mime_type, byte_size=EXCLUDED.byte_size, content_hash=EXCLUDED.content_hash, thumbnail_path=EXCLUDED.thumbnail_path, deleted_at=NULL, deleted_by=NULL
             RETURNING id`,
            [taskId, batchId || null, email, i, dup.rows[0].storage_path, refFiles[i].originalname || refFiles[i].path, refFiles[i].mimetype || 'application/octet-stream', dup.rows[0].byte_size || fileBuffer.length, contentHash, dup.rows[0].thumbnail_path]
          );
          refUrls.push('/api/media/reference/' + (dup.rows[0].id));
          await query('UPDATE image_references SET last_used_at=now(),usage_count=usage_count+1 WHERE id=$1', [dup.rows[0].id]);
          continue;
        }

        const ext = path.extname(refFiles[i].originalname || refFiles[i].path) || '.bin';
        const refFile = crypto.randomBytes(12).toString('hex') + ext;
        const storagePath = path.join(refDir, refFile);
        if (!fs.existsSync(storagePath)) fs.copyFileSync(refFiles[i].path, storagePath);
        const stat = fs.statSync(storagePath);
        const { rows } = await query(
          `INSERT INTO image_references(task_id, batch_id, owner_email, position, storage_path, original_name, mime_type, byte_size, content_hash)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT(batch_id, position) WHERE batch_id IS NOT NULL
           DO UPDATE SET storage_path=EXCLUDED.storage_path, original_name=EXCLUDED.original_name, mime_type=EXCLUDED.mime_type, byte_size=EXCLUDED.byte_size, content_hash=EXCLUDED.content_hash, deleted_at=NULL, deleted_by=NULL
           RETURNING id`,
          [taskId, batchId || null, email, i, storagePath, refFiles[i].originalname || refFile, refFiles[i].mimetype || 'application/octet-stream', stat.size, contentHash]
        );
        const refId = rows[0].id;
        refUrls.push('/api/media/reference/' + refId);
        try {
          const refThumbnailPath = await generateReferenceThumbnail(storagePath, refId);
          await query('UPDATE image_references SET thumbnail_path=$2 WHERE id=$1', [refId, refThumbnailPath]);
        } catch (thumbError) {
          console.error(`Reference thumbnail generation failed for ${referenceKey}_${i}:`, thumbError.message);
        }
      } catch (error) {
        console.warn('Failed to save ref image ' + i + ' for ' + referenceKey + ': ' + error.message);
      }
    }
    return refUrls;
  })();
  batchReferencePromises.set(referenceKey, promise);
  try {
    return await promise;
  } finally {
    batchReferencePromises.delete(referenceKey);
  }
}

async function processTask(taskId, prompt, model, ratio, resolution, refFiles, email, batchId = null) {
  try {
    // Persist one local reference asset per batch before provider processing.
    const refUrls = await persistBatchReferences(batchId, taskId, refFiles, email);

    if (pendingTasks.get(taskId)?.cancelRequested) throw Object.assign(new Error('Cancellation requested'), { cancelled: true });
    const result = await generateImageRotate(prompt, model, ratio, resolution, refFiles, taskId);
    if (pendingTasks.get(taskId)?.cancelRequested) throw Object.assign(new Error('Cancellation requested'), { cancelled: true });
    const watermarkRequired = config.FREE_WATERMARK_ENABLED && Boolean(pendingTasks.get(taskId)?.freeWatermarked);
    const sourceUrl = result.url || (Array.isArray(result.imageUrls) ? result.imageUrls[0] : '');
    let downloaded = false;
    if (sourceUrl) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const resp = await fetch(sourceUrl);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const buffer = Buffer.from(await resp.arrayBuffer());
          const resultDir = path.join(config.STORAGE_DIR, 'results');
          fs.mkdirSync(resultDir, { recursive: true });
          const localFile = taskId + '.png';
          const storagePath = path.join(resultDir, localFile);
          fs.writeFileSync(storagePath, buffer);
          if (watermarkRequired) {
            await applyWatermark(storagePath);
            result.watermarked = true;
          }
          result.storagePath = storagePath;
          result.localUrl = '/api/media/result/' + taskId;
          
          // Generate thumbnail async (non-blocking) so user sees result faster.
          // Fallback: thumbnail endpoint serves original image if thumbnail missing.
          generateThumbnail(storagePath, taskId).then(thumbnailPath => {
            result.thumbnailPath = thumbnailPath;
            saveResult({ ...result, thumbnailPath }, email, taskId, batchId, batchPosition).catch(() => {});
            console.log(`Thumbnail generated for ${taskId}`);
          }).catch(thumbError => {
            console.error(`Thumbnail generation failed for ${taskId}:`, thumbError.message);
          });
          
          // Get image metadata async (non-blocking).
          getImageMetadata(storagePath).then(metadata => {
            if (metadata) {
              result.width = metadata.width;
              result.height = metadata.height;
              result.format = metadata.format;
              result.fileSize = metadata.size;
              saveResult({ ...result }, email, taskId, batchId, batchPosition).catch(() => {});
            }
          }).catch(metaError => {
            console.error(`Metadata extraction failed for ${taskId}:`, metaError.message);
          });
          
          downloaded = true;
          break;
        } catch (e) {
          if (attempt === 0) {
            console.warn(`Image download failed for ${taskId} (retrying): ${e.message}`);
            await new Promise(r => setTimeout(r, 2000));
          } else {
            console.error(`Image download failed for ${taskId} after retry: ${e.message}`);
            result.downloadFailed = true;
          }
        }
      }
    }
    if (watermarkRequired && !downloaded) {
      throw new Error('Free-tier image could not be secured for delivery');
    }
    if (watermarkRequired) {
      // Never expose the provider's clean source URL for free-tier output.
      delete result.url;
      result.imageUrls = [];
    }
    if (pendingTasks.get(taskId)?.cancelRequested) throw cancelledError();
    const batchPosition = pendingTasks.get(taskId)?.batchPosition;
    const savedResult = { ...result, providerTaskId: result.taskId, taskId, batchId: batchId || undefined, batchPosition, refUrls: refUrls.length > 0 ? refUrls : undefined, timestamp: new Date().toISOString(), originalPrompt: prompt, user: email };
    await saveResult(savedResult, email, taskId, batchId, batchPosition);
    pendingTasks.set(taskId, { ...pendingTasks.get(taskId), status: 'done', ...result, taskId, batchId, providerTaskId: result.taskId, refUrls: savedResult.refUrls, email, user: email });
    await saveTask(taskId, pendingTasks.get(taskId));
    await userActivity.logActivity(email, 'generation.completed', null, { taskId, model, cost: pendingTasks.get(taskId)?.cost || result.estimatedCredit || 0 });
  } catch (e) {
    try {
      // Legacy single-task references are cleaned on failure. Batch references
      // stay available to sibling tasks and for administrative review.
      if (!batchId) {
        const { rows } = await query('DELETE FROM image_references WHERE task_id=$1 RETURNING storage_path,thumbnail_path', [taskId]);
        for (const row of rows) for (const filePath of [row.storage_path, row.thumbnail_path]) { try { if (filePath) fs.unlinkSync(filePath); } catch (_) {} }
      }
    } catch (cleanupError) {
      console.warn('Reference cleanup failed for ' + taskId + ': ' + cleanupError.message);
    }
    const task = pendingTasks.get(taskId);
    const status = e.cancelled ? 'cancelled' : 'error';
    pendingTasks.set(taskId, { ...task, status, error: e.message });
    await saveTask(taskId, pendingTasks.get(taskId));
    await userActivity.logActivity(email, status === 'cancelled' ? 'generation.cancelled' : 'generation.failed', null, { taskId, model, error: e.message, cost: task?.cost || 0 });
    const cost = task?.cost || 0;
    if (cost > 0) await refundTaskOnce(taskId, e.cancelled ? 'cancel_refund' : 'refund');
  } finally {
    // Defensive cleanup for failures between provider task creation and wait.
    // The provider API key must never outlive the local in-memory task control.
    providerControls.delete(taskId);
    for (const file of refFiles || []) { try { fs.unlinkSync(file.path); } catch (_) {} }
  }
}

async function refundTaskOnce(taskId, reason) {
  const { withTransaction } = require('./db');
  return withTransaction(async client => {
    const result = await client.query('UPDATE image_tasks SET refunded_at=now() WHERE task_id=$1 AND refunded_at IS NULL AND cost>0 RETURNING email,cost', [taskId]);
    if (!result.rows[0]) return false;
    await client.query('UPDATE users SET credits=credits+$2 WHERE email=$1', [result.rows[0].email, result.rows[0].cost]);
    await client.query("INSERT INTO transactions(email,type,amount,reason) VALUES($1,'credit',$2,$3)", [result.rows[0].email, result.rows[0].cost, reason]);
    return true;
  });
}

async function cancelTask(taskId, actor = 'admin') {
  const task = pendingTasks.get(taskId);
  if (task?.status === 'queued') {
    const index = generationQueue.findIndex(job => job.taskId === taskId);
    if (index >= 0) generationQueue.splice(index, 1);
    pendingTasks.set(taskId, { ...task, status: 'cancelled', cancelledAt: new Date().toISOString() });
    await query("UPDATE image_tasks SET status='cancelled',cancel_requested_at=now(),cancelled_at=now(),cancelled_by=$2,finished_at=now(),actual_completion=now(),processing_duration=GREATEST(0,EXTRACT(EPOCH FROM (now()-COALESCE(started_at,created_at)))::int) WHERE task_id=$1 AND status='queued'", [taskId, actor]);
    await refundTaskOnce(taskId, 'cancel_refund');
    await userActivity.logActivity(task.email, 'generation.cancelled', null, { taskId, model: task.model, actor, cost: task.cost || 0 });
    return { status: 'cancelled', cancellationRequested: false };
  }
  const updated = await query("UPDATE image_tasks SET cancel_requested_at=COALESCE(cancel_requested_at,now()),cancelled_by=$2 WHERE task_id=$1 AND status='running' RETURNING task_id", [taskId, actor]);
  if (updated.rows[0]) {
    if (task) pendingTasks.set(taskId, { ...task, cancelRequested: true });
    const providerCancellation = await cancelProviderTask(taskId);
    const current = await query('SELECT status FROM image_tasks WHERE task_id=$1', [taskId]);
    const status = current.rows[0]?.status || 'running';
    return { status, cancellationRequested: status === 'running', providerCancellation };
  }
  const found = await query('SELECT status FROM image_tasks WHERE task_id=$1', [taskId]);
  return found.rows[0] ? { status: found.rows[0].status, cancellationRequested: false } : null;
}

function queueSnapshot() {
  return { queued: generationQueue.map((job, position) => ({ taskId: job.taskId, email: job.email, model: job.model, position: position + 1 })), active: activeGenerations, paused: queuePaused, maxConcurrent: maxConcurrentGenerations, maxQueued: maxQueuedGenerations };
}

// Alias for backwards compatibility
const generateImage = generateImageRotate;

module.exports = {
  enhancePrompt,
  getModels,
  getModelCost,
  loadCosts,
  loadTasks,
  saveTask,
  activeTasksForUser,
  activeTasksForUserFromDb,
  getActiveTasks,
  getQueueLength,
  loadQueueConfig,
  applyQueueConfig,
  prioritizeTask,
  enqueueGeneration,
  pendingTasks,
  cancelTask,
  refundTaskOnce,
  queueSnapshot,
  listResults,
  archiveResult,
  deleteResult,
  generateImage,
  maxUserGenerations,
  get maxQueuedGenerations() { return maxQueuedGenerations; },
};
