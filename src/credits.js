const crypto = require('crypto');
const { query, withTransaction } = require('./db');
const { config } = require('./config');

function mapUser(row) {
  if (!row) return null;
  const unlimitedUntil = row.unlimited_until || null;
  const unlimitedActive = Boolean(row.unlimited) && (!unlimitedUntil || new Date(unlimitedUntil).getTime() > Date.now());
  return {
    email: row.email,
    telegramId: row.telegram_id,
    telegramUsername: row.telegram_username,
    username: row.username,
    displayName: row.display_name,
    credits: row.credits,
    unlimited: unlimitedActive,
    unlimitedUntil,
    freeTrial: Boolean(row.free_trial),
    totalCredits: row.total_credits,
    signupIP: row.signup_ip,
    createdAt: row.created_at,
    lastLogin: row.last_login,
    emailVerifiedAt: row.email_verified_at,
    suspendedAt: row.suspended_at,
    suspensionReason: row.suspension_reason,
    sessionVersion: row.session_version || 0,
    freeGrantHeld: Boolean(row.free_grant_held),
    tosAccepted: Boolean(row.tos_accepted),
  };
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
}

async function availableUsername(client, preferred, seed) {
  let base = normalizeUsername(preferred);
  if (base.length < 3) base = 'user';
  let candidate = base;
  let exists = await client.query('SELECT 1 FROM users WHERE lower(username)=lower($1) LIMIT 1', [candidate]);
  if (!exists.rows[0]) return candidate;
  const suffix = crypto.createHash('sha256').update(String(seed || crypto.randomBytes(16).toString('hex'))).digest('hex').slice(0, 8);
  candidate = `${base.slice(0, 15)}_${suffix}`.slice(0, 24);
  exists = await client.query('SELECT 1 FROM users WHERE lower(username)=lower($1) LIMIT 1', [candidate]);
  if (!exists.rows[0]) return candidate;
  return `user_${crypto.randomBytes(9).toString('hex').slice(0, 18)}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, expected] = stored.split(':');
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

async function registerPasswordUser(email, password, ip) {
  return withTransaction(async (client) => {
    const existing = await client.query('SELECT * FROM users WHERE email=$1 FOR UPDATE', [email]);
    if (existing.rows[0]) {
      if (existing.rows[0].password_hash) return { error: 'Email already registered' };
       const { rows } = await client.query('UPDATE users SET password_hash=$2,email_verified_at=NULL WHERE email=$1 RETURNING *', [email, hashPassword(password)]);
      return { user: mapUser(rows[0]) };
    }
    const count = await client.query('SELECT count(*)::int AS count FROM users WHERE signup_ip=$1', [ip]);
    if (count.rows[0].count >= config.MAX_FREE_ACCOUNTS_PER_IP) return { error: 'Free account limit reached for this network' };
    const emailDomain = email.split('@').pop() || '';
    // Serialize grants per domain so concurrent signups cannot both bypass the threshold.
    await client.query('SELECT pg_advisory_xact_lock(hashtext(lower($1)))', [emailDomain]);
    const domainCount = await client.query(
      "SELECT count(*)::int AS count FROM users WHERE lower(split_part(email, '@', 2)) = lower(split_part($1, '@', 2)) AND created_at > now() - interval '24 hours'",
      [email]
    );
    const freeGrantHeld = domainCount.rows[0].count >= config.MAX_FREE_ACCOUNTS_PER_EMAIL_DOMAIN;
    const profileCode = crypto.randomBytes(5).toString('hex');
    const username = await availableUsername(client, `kreator_${profileCode}`, email);
    const displayName = `Kreator ${profileCode.slice(0, 6).toUpperCase()}`;
    const { rows } = await client.query('INSERT INTO users(email,username,display_name,password_hash,credits,total_credits,signup_ip,email_verified_at,free_grant_held,unlimited,unlimited_until,free_trial) VALUES($1,$2,$3,$4,0,0,$5,NULL,$6,true,now()+interval\'7 days\',true) RETURNING *', [email, username, displayName, hashPassword(password), ip, freeGrantHeld]);
    return { user: mapUser(rows[0]), freeGrantHeld };
  });
}

async function loginPasswordUser(email, password) {
  const { rows } = await query('SELECT * FROM users WHERE email=$1', [email]);
  if (!rows[0] || !verifyPassword(password, rows[0].password_hash)) return null;
  await query('UPDATE users SET last_login=now() WHERE email=$1', [email]);
  return mapUser(rows[0]);
}

async function getUser(email) {
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  return mapUser(rows[0]);
}

async function ensureUser(email, ip) {
  return withTransaction(async (client) => {
    const existing = await client.query('SELECT * FROM users WHERE email = $1 FOR UPDATE', [email]);
    if (existing.rows[0]) {
      const { rows } = await client.query('UPDATE users SET last_login = now() WHERE email = $1 RETURNING *', [email]);
      return mapUser(rows[0]);
    }
    const count = await client.query('SELECT count(*)::int AS count FROM users WHERE signup_ip = $1', [ip]);
    if (count.rows[0].count >= config.MAX_FREE_ACCOUNTS_PER_IP) return null;
    const { rows } = await client.query(
      'INSERT INTO users(email, username, display_name, credits, total_credits, signup_ip, unlimited, unlimited_until, free_trial) VALUES($1,$2,$3,0,0,$4,true,now()+interval\'7 days\',true) RETURNING *',
      [email, await availableUsername(client, email.split('@')[0], email), email.split('@')[0] || 'Kreator Kreasya', ip]
    );
    return mapUser(rows[0]);
  });
}

async function ensureTelegramUser(telegramId, profile, ip) {
  return withTransaction(async (client) => {
    const existing = await client.query('SELECT * FROM users WHERE telegram_id = $1 FOR UPDATE', [String(telegramId)]);
    if (existing.rows[0]) {
      const { rows } = await client.query(
        'UPDATE users SET last_login = now(), telegram_username = $2 WHERE telegram_id = $1 RETURNING *',
        [String(telegramId), profile.username || '']
      );
      return mapUser(rows[0]);
    }
    const count = await client.query('SELECT count(*)::int AS count FROM users WHERE signup_ip = $1', [ip]);
    if (count.rows[0].count >= config.MAX_FREE_ACCOUNTS_PER_IP) return null;
    const email = `tg${telegramId}@telegram.user`;
    const username = await availableUsername(client, profile.username, `telegram:${telegramId}`);
    const { rows } = await client.query(
      'INSERT INTO users(email, telegram_id, telegram_username, username, display_name, credits, total_credits, signup_ip, unlimited, unlimited_until, free_trial) VALUES($1,$2,$3,$4,$5,0,0,$6,true,now()+interval\'7 days\',true) RETURNING *',
      [email, String(telegramId), profile.username || '', username, profile.displayName || 'Telegram User', ip]
    );
    return mapUser(rows[0]);
  });
}

async function updateProfile(email, username, displayName) {
  const normalized = normalizeUsername(username);
  const name = String(displayName || '').trim().replace(/\s+/g, ' ');
  if (!/^[a-z0-9_]{3,24}$/.test(normalized)) return { error: 'Username harus 3–24 karakter dan hanya boleh berisi huruf kecil, angka, atau underscore', code: 'INVALID_USERNAME' };
  if (name.length < 2 || name.length > 50) return { error: 'Nama harus berisi 2–50 karakter', code: 'INVALID_DISPLAY_NAME' };
  try {
    const { rows } = await query('UPDATE users SET username=$2,display_name=$3 WHERE email=$1 AND NOT EXISTS (SELECT 1 FROM users other WHERE lower(other.username)=lower($2) AND other.email<>$1) RETURNING *', [email, normalized, name]);
    if (!rows[0]) return { error: 'Username sudah digunakan', code: 'USERNAME_TAKEN' };
    return { user: mapUser(rows[0]) };
  } catch (error) {
    if (error.code === '23505') return { error: 'Username sudah digunakan', code: 'USERNAME_TAKEN' };
    throw error;
  }
}

async function deductCredits(email, amount, reason) {
  return withTransaction(async (client) => {
    const r = await client.query(
      'UPDATE users SET credits = credits - $2 WHERE email = $1 AND credits >= $2 RETURNING *',
      [email, amount]
    );
    if (!r.rows[0]) return false;
    await client.query("INSERT INTO transactions(email, type, amount, reason) VALUES($1, 'debit', $2, $3)", [email, amount, reason || 'generate']);
    return true;
  });
}

async function addCredits(email, amount, reason) {
  return withTransaction(async (client) => {
    const r = await client.query(
      'UPDATE users SET credits = credits + $2, total_credits = total_credits + $2 WHERE email = $1 RETURNING *',
      [email, amount]
    );
    if (!r.rows[0]) return false;
    await client.query("INSERT INTO transactions(email, type, amount, reason) VALUES($1, 'credit', $2, $3)", [email, amount, reason || 'topup']);
    return true;
  });
}

async function getAllUsers() {
  const { rows } = await query(
    `SELECT email, credits, total_credits AS "totalCredits", COALESCE((SELECT SUM(cost) FROM image_tasks t WHERE t.email=users.email AND t.status='done'),0)::int AS "totalSpent",
       signup_ip AS "signupIP", created_at AS "createdAt", last_login AS "lastLogin",
       (SELECT count(*) FROM transactions t WHERE t.email = users.email)::int AS "transactionCount"
     FROM users ORDER BY credits DESC`
  );
  return rows;
}

async function searchUsers({ page = 1, limit = 50, q = '', suspended, verified } = {}) {
  const where = [];
  const params = [];
  if (q) { params.push(`%${q}%`); where.push(`(email ILIKE $${params.length} OR username ILIKE $${params.length} OR display_name ILIKE $${params.length})`); }
  if (suspended === true) where.push('suspended_at IS NOT NULL');
  if (suspended === false) where.push('suspended_at IS NULL');
  if (verified === true) where.push('email_verified_at IS NOT NULL');
  if (verified === false) where.push('email_verified_at IS NULL');
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await query(`SELECT count(*)::int AS total FROM users ${clause}`, params);
  params.push(limit, (page - 1) * limit);
  const { rows } = await query(`SELECT email,username,display_name AS "displayName",credits,total_credits AS "totalCredits",COALESCE((SELECT SUM(cost) FROM image_tasks t WHERE t.email=users.email AND t.status='done'),0)::int AS "totalSpent",unlimited,signup_ip AS "signupIP",created_at AS "createdAt",last_login AS "lastLogin",email_verified_at AS "emailVerifiedAt",suspended_at AS "suspendedAt",suspension_reason AS "suspensionReason",session_version AS "sessionVersion" FROM users ${clause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { items: rows, total: count.rows[0].total, page, limit };
}

async function getCreditHistory(email) {
  const { rows } = await query('SELECT type, amount, reason, time FROM transactions WHERE email = $1 ORDER BY time DESC LIMIT 200', [email]);
  return rows;
}

async function getAllTransactions() {
  const { rows } = await query('SELECT email, type, amount, reason, time FROM transactions ORDER BY time DESC LIMIT 500');
  return rows;
}

async function getTotalCredits() {
  const { rows } = await query('SELECT COALESCE(sum(credits), 0)::int AS total, count(*)::int AS users FROM users');
  return { total: rows[0].total, users: rows[0].users };
}

module.exports = {
  hashPassword,
  verifyPassword,
  getUser,
  registerPasswordUser,
  loginPasswordUser,
  ensureUser,
  ensureTelegramUser,
  updateProfile,
  deductCredits,
  addCredits,
  getAllUsers,
  searchUsers,
  getCreditHistory,
  getAllTransactions,
  getTotalCredits,
};
