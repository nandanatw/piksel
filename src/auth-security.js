const crypto = require('crypto');
const { query, withTransaction } = require('./db');
const { config } = require('./config');

function identityHash(value) {
  return crypto.createHmac('sha256', config.JWT_SECRET).update(String(value || 'unknown')).digest('hex');
}

async function consumeLimit(bucket, identity, max, windowSeconds) {
  const keyHash = identityHash(identity);
  const secs = Number(windowSeconds);
  const { rows } = await query(
    `INSERT INTO auth_rate_limits(bucket,key_hash,window_started_at,count)
     VALUES($1,$2,now(),1)
     ON CONFLICT(bucket,key_hash) DO UPDATE SET
       window_started_at=CASE WHEN auth_rate_limits.window_started_at <= now()-interval '${secs} seconds' THEN now() ELSE auth_rate_limits.window_started_at END,
       count=CASE WHEN auth_rate_limits.window_started_at <= now()-interval '${secs} seconds' THEN 1 ELSE auth_rate_limits.count+1 END
     RETURNING count,window_started_at`,
    [bucket, keyHash],
  );
  return Number(rows[0]?.count || 0) <= max;
}

function clientIp(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

async function enforcePasswordAuthLimit(req, res, next) {
  try {
    const mode = req.body?.mode === 'register' ? 'register' : 'login';
    const email = String(req.body?.email || '').trim().toLowerCase();
    const ip = clientIp(req);
    const max = mode === 'register' ? config.REGISTER_RATE_LIMIT_PER_HOUR : config.LOGIN_RATE_LIMIT_PER_15_MINUTES;
    const seconds = mode === 'register' ? 3600 : 900;
    const allowedIp = await consumeLimit(`${mode}:ip`, ip, max, seconds);
    const allowedEmail = await consumeLimit(`${mode}:email`, email || 'missing', max, seconds);
    if (!allowedIp || !allowedEmail) return res.status(429).json({ error: 'Too many attempts, please try again later' });
    next();
  } catch (error) {
    next(error);
  }
}

async function enforceVerificationLimit(req, res, next) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const max = config.VERIFICATION_RATE_LIMIT_PER_HOUR;
    const allowedIp = await consumeLimit('verification:ip', clientIp(req), max, 3600);
    const allowedEmail = await consumeLimit('verification:email', email || 'missing', max, 3600);
    if (!allowedIp || !allowedEmail) return res.status(429).json({ error: 'Too many verification requests, please try again later' });
    next();
  } catch (error) {
    next(error);
  }
}

async function enforcePasswordResetLimit(req, res, next) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const max = config.PASSWORD_RESET_RATE_LIMIT_PER_HOUR;
    const allowedIp = await consumeLimit('password-reset:ip', clientIp(req), max, 3600);
    const allowedEmail = await consumeLimit('password-reset:email', email || 'missing', max, 3600);
    if (!allowedIp || !allowedEmail) return res.status(429).json({ error: 'Too many reset requests, please try again later' });
    next();
  } catch (error) {
    next(error);
  }
}

async function enforcePasswordResetSubmitLimit(req, res, next) {
  try {
    const token = String(req.body?.token || 'missing');
    const max = config.PASSWORD_RESET_SUBMIT_LIMIT_PER_15_MINUTES;
    const allowedIp = await consumeLimit('password-reset-submit:ip', clientIp(req), max, 900);
    const allowedToken = await consumeLimit('password-reset-submit:token', token, max, 900);
    if (!allowedIp || !allowedToken) return res.status(429).json({ error: 'Too many reset attempts, please try again later' });
    next();
  } catch (error) {
    next(error);
  }
}

async function reserveVerificationEmail(email, kind) {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('verification-email-budget'))");
    const daily = await client.query("SELECT count(*)::int AS total FROM verification_email_log WHERE created_at > now()-interval '24 hours'");
    if (daily.rows[0].total >= config.VERIFICATION_DAILY_EMAIL_LIMIT) return false;
    await client.query('INSERT INTO verification_email_log(email_hash,kind) VALUES($1,$2)', [identityHash(email), kind]);
    return true;
  });
}

async function verifyTurnstile(token, ip) {
  const secret = String(process.env.TURNSTILE_SECRET_KEY || config.TURNSTILE_SECRET_KEY || '');
  if (!secret) return { ok: true, configured: false };
  if (!token) return { ok: false, configured: true };
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: String(token), remoteip: String(ip || '') }),
    });
    const data = await response.json();
    return { ok: Boolean(response.ok && data.success), configured: true };
  } catch (_) {
    return { ok: false, configured: true };
  }
}

module.exports = {
  enforcePasswordAuthLimit,
  enforceVerificationLimit,
  enforcePasswordResetLimit,
  enforcePasswordResetSubmitLimit,
  reserveVerificationEmail,
  verifyTurnstile,
};
