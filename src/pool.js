const { query } = require('./db');
const { config } = require('./config');

const lockedKeys = new Set();
const keyUsage = new Map();
let roundRobinCursor = 0;
let nextBalanceRefreshAt = 0;
let balanceRefreshPromise = null;

function modalEndpoint() {
  return config.MODAL_ENDPOINT_URL || 'https://piksel-image-gen--fastapi-app.modal.run';
}

function modalHeaders() {
  return {
    'Authorization': `Bearer ${config.MODAL_API_KEY || 'piksel-dev-key'}`,
    'Content-Type': 'application/json',
  };
}

async function modalFetch(path, options = {}) {
  const url = `${modalEndpoint()}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: { ...modalHeaders(), ...(options.headers || {}) },
  });
  const text = await resp.text();
  if (!resp.ok) {
    const err = new Error(text || `Modal HTTP ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return text;
}

async function modalUpload(path, filePath, fieldName = 'file') {
  const url = `${modalEndpoint()}${path}`;
  const fs = require('fs');
  const FormData = require('form-data');
  const form = new FormData();
  form.append(fieldName, fs.createReadStream(filePath));
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.MODAL_API_KEY || 'piksel-dev-key'}`,
      ...form.getHeaders(),
    },
    body: form,
  });
  const text = await resp.text();
  if (!resp.ok) {
    const err = new Error(text || `Modal HTTP ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return text;
}

async function runCLI(args, env, options = {}) {
  const cmd = args[0];
  const sub = args[1];

  if (cmd === 'account' && sub === 'status') {
    return await modalFetch('/account/status');
  }

  if (cmd === 'task' && sub === 'cost') {
    const model = args[2];
    return await modalFetch(`/task/cost/${model}`);
  }

  if (cmd === 'upload') {
    return await modalUpload('/upload', args[1]);
  }

  if (cmd === 'analyze') {
    return await modalUpload('/analyze', args[1]);
  }

  if (cmd === 'task' && sub === 'create') {
    const modelIdx = args.indexOf('--model');
    const promptIdx = args.indexOf('--prompt');
    const ratioIdx = args.indexOf('--ratio');
    const resIdx = args.indexOf('--resolution');
    const materialsIdx = args.indexOf('--materials');

    const model = modelIdx >= 0 ? args[modelIdx + 1] : 'flux-schnell';
    const prompt = promptIdx >= 0 ? args[promptIdx + 1] : '';
    const ratio = ratioIdx >= 0 ? args[ratioIdx + 1] : '1:1';
    const resolution = resIdx >= 0 ? args[resIdx + 1] : '1k';

    // generation.js passes the base64 payload returned by /upload directly.
    const refImageB64 = materialsIdx >= 0 ? args[materialsIdx + 1] : null;

    const body = { model, prompt, ratio, resolution };
    if (refImageB64) body.ref_image_b64 = refImageB64;

    const out = await modalFetch('/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const data = JSON.parse(out);
    const taskId = `modal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    return JSON.stringify({
      task: {
        id: taskId,
        estimatedCredit: data.estimatedCredit || 6,
      },
      imageUrl: data.imageUrl,
      imageUrls: data.imageUrls || [],
      _directResult: true,
    });
  }

  if (cmd === 'task' && (sub === 'wait' || sub === 'result')) {
    return '{}';
  }

  if (cmd === 'task' && sub === 'cancel') {
    return '{"cancelled":true}';
  }

  throw new Error(`Unknown CLI command: ${cmd} ${sub}`);
}

function mapKey(row) {
  return {
    id: row.id,
    email: row.email,
    key: row.api_key,
    balance: row.balance,
    exhausted: row.exhausted,
    exhaustedAt: row.exhausted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    healthStatus: row.health_status,
    healthMessage: row.health_message,
    lastCheckedAt: row.last_checked_at,
    consecutiveFailures: row.consecutive_failures,
  };
}

async function listKeys() {
  const { rows } = await query('SELECT * FROM api_keys ORDER BY created_at ASC, balance ASC');
  return rows.map(mapKey);
}

async function addKey(email, apiKey, balance) {
  const { rows } = await query(
    'INSERT INTO api_keys(email, api_key, balance) VALUES($1, $2, $3) ON CONFLICT(api_key) DO UPDATE SET balance = EXCLUDED.balance, exhausted = false, updated_at = now() RETURNING *',
    [email || '', apiKey, balance || 0]
  );
  return mapKey(rows[0]);
}

async function clearPool() {
  await query('DELETE FROM api_keys');
}

async function updateBalance(apiKey, balance) {
  const exhausted = balance <= 0;
  await query(
    'UPDATE api_keys SET balance = $2, exhausted = $3, exhausted_at = CASE WHEN $3 THEN now() ELSE exhausted_at END, updated_at = now() WHERE api_key = $1',
    [apiKey, balance, exhausted]
  );
}

async function consumeBalance(apiKey, amount) {
  const { rows } = await query(
    `UPDATE api_keys
     SET balance = GREATEST(0, balance - $2),
         exhausted = balance - $2 <= 0,
         exhausted_at = CASE WHEN balance - $2 <= 0 THEN now() ELSE exhausted_at END,
         updated_at = now()
     WHERE api_key = $1
     RETURNING balance`,
    [apiKey, amount]
  );
  return Number(rows[0]?.balance ?? 0);
}

async function markExhausted(apiKey) {
  await query(
    'UPDATE api_keys SET exhausted = true, balance = 0, exhausted_at = now(), updated_at = now() WHERE api_key = $1',
    [apiKey]
  );
}

async function syncCredits(pool) {
  for (const entry of pool) {
    if (!entry.key || entry.exhausted) continue;
    try {
      const out = await runCLI(['account', 'status', '--json'], { RENOISE_API_KEY: entry.key });
      const data = JSON.parse(out);
      const balance = data.credit?.balance ?? 0;
      if (entry.balance !== balance) {
        await updateBalance(entry.key, balance);
        entry.balance = balance;
        entry.exhausted = balance <= 0;
      } else if (balance <= 0 && !entry.exhausted) {
        await markExhausted(entry.key);
        entry.exhausted = true;
        entry.exhaustedAt = new Date().toISOString();
      }
    } catch (e) {
      if (/credit|balance|insufficient|unauthorized|auth/i.test(e.message)) {
        if (!entry.exhausted) {
          await markExhausted(entry.key);
          entry.exhausted = true;
          entry.exhaustedAt = new Date().toISOString();
        }
      }
    }
  }
  return pool;
}

async function refreshCredits() {
  const pool = await listKeys();
  const now = Date.now();
  if (now >= nextBalanceRefreshAt && !balanceRefreshPromise) {
    nextBalanceRefreshAt = now + config.POOL_BALANCE_REFRESH_MS;
    const snapshot = pool.map(entry => ({ ...entry }));
    balanceRefreshPromise = syncCredits(snapshot)
      .catch(error => console.error('Background pool balance refresh failed:', error.message))
      .finally(() => { balanceRefreshPromise = null; });
  }
  return pool;
}

function classifyError(message) {
  if (/unauthorized|invalid.*key|authentication|401|403/i.test(message)) return 'auth';
  if (/credit|balance|insufficient|quota|exhausted/i.test(message)) return 'exhausted';
  return 'degraded';
}

async function checkKey(id) {
  const found = await query('SELECT * FROM api_keys WHERE id=$1', [id]);
  if (!found.rows[0]) return null;
  try {
    const out = await runCLI(['account', 'status', '--json'], { RENOISE_API_KEY: found.rows[0].api_key });
    const data = JSON.parse(out);
    const balance = Number(data.credit?.balance ?? 0);
    const status = balance <= 0 ? 'exhausted' : 'healthy';
    const { rows } = await query('UPDATE api_keys SET balance=$2,exhausted=$3,health_status=$4,health_message=NULL,last_checked_at=now(),consecutive_failures=0,updated_at=now() WHERE id=$1 RETURNING *', [id, balance, balance <= 0, status]);
    return mapKey(rows[0]);
  } catch (error) {
    const status = classifyError(error.message);
    const { rows } = await query('UPDATE api_keys SET health_status=$2,health_message=$3,last_checked_at=now(),consecutive_failures=consecutive_failures+1,exhausted=CASE WHEN $2 IN (\'auth\',\'exhausted\') THEN true ELSE exhausted END,updated_at=now() WHERE id=$1 RETURNING *', [id, status, String(error.message).slice(0, 500)]);
    return mapKey(rows[0]);
  }
}

function selectBestKey(pool, estimatedCost, excludeKeys) {
  if (pool.length === 0) return null;
  for (let offset = 0; offset < pool.length; offset++) {
    const index = (roundRobinCursor + offset) % pool.length;
    const entry = pool[index];
    const usage = keyUsage.get(entry.key) || { active: 0, reserved: 0 };
    const availableBalance = Number(entry.balance || 0) - usage.reserved;
    const unhealthy = entry.healthStatus === 'auth' || entry.healthStatus === 'exhausted';
    if (!entry.exhausted && !unhealthy && entry.key && !excludeKeys.has(entry.key) && usage.active < config.MAX_CONCURRENT_PER_KEY && availableBalance >= estimatedCost) {
      keyUsage.set(entry.key, { active: usage.active + 1, reserved: usage.reserved + estimatedCost });
      lockedKeys.add(entry.key);
      roundRobinCursor = (index + 1) % pool.length;
      return entry;
    }
  }
  return null;
}

function releaseKey(apiKey, reservedCost) {
  const usage = keyUsage.get(apiKey);
  if (!usage) return;
  const next = {
    active: Math.max(0, usage.active - 1),
    reserved: Math.max(0, usage.reserved - reservedCost),
  };
  if (next.active === 0) {
    keyUsage.delete(apiKey);
    lockedKeys.delete(apiKey);
  } else {
    keyUsage.set(apiKey, next);
  }
}

module.exports = {
  runCLI,
  listKeys,
  addKey,
  clearPool,
  updateBalance,
  consumeBalance,
  markExhausted,
  refreshCredits,
  checkKey,
  selectBestKey,
  releaseKey,
  lockedKeys,
};