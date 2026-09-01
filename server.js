require('dotenv').config();
const settings = require('./settings');
settings.hydrate();

const { config, IMAGE_MODELS, REFERENCE_IMAGE_MODELS } = require('./src/config');
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const db = require('./src/db');
const auth = require('./src/auth');
const authSecurity = require('./src/auth-security');
const credits = require('./src/credits');
const poolModule = require('./src/pool');
const signup = require('./src/signup');
const generation = require('./src/generation');
const payments = require('./src/payments');
const plans = require('./src/plans');
const vouchers = require('./src/vouchers');
const telegram = require('./src/telegram');
const audit = require('./src/audit');
const userActivity = require('./src/user-activity');
const dbBackup = require('./src/db-backup');
const thumbnails = require('./src/thumbnails');
const crypto = require('crypto');
const { execFile } = require('child_process');

const app = express();
app.set('trust proxy', config.TRUST_PROXY ? 1 : false);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://telegram.org', 'https://challenges.cloudflare.com', 'https://static.cloudflareinsights.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://cloudflareinsights.com'],
      frameSrc: ['https://oauth.telegram.org', 'https://telegram.org', 'https://challenges.cloudflare.com'],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", 'https://oauth.telegram.org'],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));
app.use(express.json());
app.use(cookieParser());

// Check for blocked IPs
app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  
  try {
    const { query } = require('./src/db');
    const clientIp = req.ip;
    const blocked = await query('SELECT reason FROM blocked_ips WHERE ip = $1', [clientIp]);
    
    if (blocked.rows[0]) {
      await userActivity.logActivity('blocked', 'security.blocked_ip_access', req, { 
        ip: clientIp, 
        reason: blocked.rows[0].reason,
        path: req.path 
      });
      return res.status(403).json({ error: 'Access denied', code: 'IP_BLOCKED' });
    }
  } catch (e) {
    console.error('IP block check failed:', e.message);
  }
  
  next();
});

const publicDir = config.PUBLIC_DIR;
const spaEntry = path.join(publicDir, 'index.html');

// Serve the React SPA for both clean URLs and legacy entry points.
app.get(['/admin', '/admin.html', '/generate', '/gallery', '/explore', '/help', '/admin/gallery', '/admin/signup', '/admin/keys', '/admin/users', '/admin/settings', '/admin/plans', '/admin/vouchers', '/admin/references', '/admin/queue', '/admin/payments', '/admin/audit', '/admin/backups'], (req, res) => {
  res.sendFile(spaEntry);
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/images/')) return res.status(404).end();
  const filePath = path.join(publicDir, req.path === '/' ? 'index.html' : req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return res.sendFile(filePath);
  }
  res.sendFile(spaEntry);
});

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.API_RATE_LIMIT_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.AUTH_RATE_LIMIT_PER_15_MINUTES,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    userActivity.logActivity(req.body?.email || 'unknown', 'security.rate_limit_exceeded', req, { endpoint: req.path });
    res.status(429).json({ error: 'Too many requests, please try again later' });
  }
});
const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.GENERATION_RATE_LIMIT_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    if (req.user?.email) {
      userActivity.logActivity(req.user.email, 'security.rate_limit_exceeded', req, { endpoint: req.path });
    }
    res.status(429).json({ error: 'Too many generation requests, please slow down' });
  }
});

const upload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: config.MAX_UPLOAD_BYTES,
    files: 10,
  },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/i.test(file.mimetype)),
});

// ========== AUTH ROUTES ==========

app.post('/api/auth/magic-link', authLimiter, async (req, res) => {
  res.status(410).json({ error: 'Magic-link login has been disabled. Use email and password.' });
});

app.get('/api/auth/security-config', (req, res) => {
  const turnstileSiteKey = String(process.env.TURNSTILE_SITE_KEY || config.TURNSTILE_SITE_KEY || '');
  const turnstileSecretKey = String(process.env.TURNSTILE_SECRET_KEY || config.TURNSTILE_SECRET_KEY || '');
  res.json({ turnstileEnabled: Boolean(turnstileSiteKey && turnstileSecretKey), turnstileSiteKey });
});

app.post('/api/auth/password', authSecurity.enforcePasswordAuthLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const mode = req.body?.mode === 'register' ? 'register' : 'login';
  if (mode === 'register') return res.status(410).json({ error: 'New registrations are temporarily closed.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (!password) return res.status(400).json({ error: 'Enter your password' });
  if (mode === 'register' && (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password))) return res.status(400).json({ error: 'Password must be at least 12 characters with uppercase, lowercase, and a number' });
  if (mode === 'register') {
    if (String(req.body?.website || '').trim()) {
      await userActivity.logActivity(email, 'auth.register_blocked', req, { reason: 'honeypot' });
      return res.status(400).json({ error: 'Registration could not be completed' });
    }
    const challenge = await authSecurity.verifyTurnstile(req.body?.turnstileToken, req.ip);
    if (!challenge.ok) {
      await userActivity.logActivity(email, 'auth.register_blocked', req, { reason: 'turnstile' });
      return res.status(400).json({ error: 'Security verification failed. Please try again.' });
    }
    const emailDomain = email.split('@').pop() || '';
    const blockedDomains = String(config.BLOCKED_EMAIL_DOMAINS || '').split(',').map(domain => domain.trim().toLowerCase()).filter(Boolean);
    if (blockedDomains.includes(emailDomain)) {
      await userActivity.logActivity(email, 'auth.register_blocked', req, { reason: 'blocked_email_domain', domain: emailDomain });
      return res.status(400).json({ error: 'Please use a regular email address. Temporary email addresses are not supported.' });
    }
    const emailReserved = await authSecurity.reserveVerificationEmail(email, 'register');
    if (!emailReserved) return res.status(503).json({ error: 'Email verification is temporarily at capacity. Please try again tomorrow.' });
  }
  try {
    const result = mode === 'register'
      ? await credits.registerPasswordUser(email, password, req.ip || req.connection.remoteAddress)
      : { user: await credits.loginPasswordUser(email, password) };
    if (result.error) return res.status(409).json({ error: result.error });
    if (mode === 'register') {
      const token = crypto.randomBytes(32).toString('base64url');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      await db.query('DELETE FROM email_verification_tokens WHERE email=$1 AND used_at IS NULL', [email]);
      await db.query("INSERT INTO email_verification_tokens(email,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes')", [email, hash]);
      await auth.sendVerificationEmail(email, token);
      await userActivity.logActivity(email, 'auth.register', req, { method: 'password' });
      return res.json({ ok: true, verificationRequired: true, email, freeGrantHeld: Boolean(result.freeGrantHeld) });
    }
    if (!result.user) {
      await userActivity.logActivity(email, 'auth.failed_login', req, { reason: 'invalid_credentials' });
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (result.user.suspendedAt) return res.status(403).json({ error: result.user.suspensionReason || 'Account suspended', code: 'ACCOUNT_SUSPENDED' });
    if (!result.user.emailVerifiedAt) return res.status(403).json({ error: 'Verify your email before signing in', code: 'EMAIL_NOT_VERIFIED' });
    await userActivity.logActivity(email, 'auth.login', req, { method: 'password' });
    if (result.user.unlimited && result.user.unlimitedUntil) {
      const hoursLeft = (new Date(result.user.unlimitedUntil).getTime() - Date.now()) / 3600000;
      if (hoursLeft > 0 && hoursLeft <= 24) {
        auth.sendEmail(email, 'Plan Expiring Soon', `Your ${result.user.freeTrial ? 'free trial' : 'unlimited plan'} will expire in ${Math.round(hoursLeft)} hours. Visit https://piksel.my.id/payments to extend.`).catch(() => {});
      }
    }
    await auth.issueUserSession(req, res, result.user);
    res.json({ ok: true, email: result.user.email, credits: result.user.credits });
  } catch (e) { res.status(500).json({ error: 'Authentication failed' }); }
});

app.get('/api/auth/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/?error=missing_token');
  try {
    const hash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const verified = await db.withTransaction(async client => {
      const found = await client.query('SELECT * FROM email_verification_tokens WHERE token_hash=$1 FOR UPDATE', [hash]);
      if (!found.rows[0] || found.rows[0].used_at || new Date(found.rows[0].expires_at) <= new Date()) return null;
      await client.query('UPDATE email_verification_tokens SET used_at=now() WHERE id=$1', [found.rows[0].id]);
      const user = await client.query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()),last_login=now() WHERE email=$1 RETURNING *', [found.rows[0].email]);
      return user.rows[0];
    });
    if (!verified) return res.redirect('/?error=expired');
    await userActivity.logActivity(verified.email, 'auth.verify_email', req);
    await auth.issueUserSession(req, res, verified);
    res.redirect('/generate');
  } catch (_) { res.redirect('/?error=login_failed'); }
});

app.post('/api/auth/resend-verification', authSecurity.enforceVerificationLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const found = await db.query('SELECT email,email_verified_at FROM users WHERE email=$1', [email]);
  if (!found.rows[0] || found.rows[0].email_verified_at) return res.json({ ok: true });
  const recent = await db.query("SELECT 1 FROM email_verification_tokens WHERE email=$1 AND created_at>now()-($2::int * interval '1 second') LIMIT 1", [email, config.VERIFICATION_RESEND_COOLDOWN_SECONDS]);
  if (recent.rows[0]) return res.status(429).json({ error: 'Please wait before requesting another email' });
  const emailReserved = await authSecurity.reserveVerificationEmail(email, 'resend');
  if (!emailReserved) return res.status(503).json({ error: 'Email verification is temporarily at capacity. Please try again tomorrow.' });
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query("INSERT INTO email_verification_tokens(email,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes')", [email, crypto.createHash('sha256').update(token).digest('hex')]);
  await auth.sendVerificationEmail(email, token);
  res.json({ ok: true });
});

app.post('/api/auth/forgot-password', authSecurity.enforcePasswordResetLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const generic = { ok: true, message: 'If the account can use password login, a reset link has been sent.' };
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.json(generic);
  if (String(req.body?.website || '').trim()) return res.json(generic);
  const challenge = await authSecurity.verifyTurnstile(req.body?.turnstileToken, req.ip);
  if (!challenge.ok) return res.status(400).json({ error: 'Security verification failed. Please try again.' });
  try {
    const found = await db.query('SELECT email,password_hash FROM users WHERE email=$1 AND suspended_at IS NULL', [email]);
    if (!found.rows[0]?.password_hash) return res.json(generic);
    const emailReserved = await authSecurity.reserveVerificationEmail(email, 'password_reset');
    if (!emailReserved) return res.json(generic);
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await db.query('DELETE FROM password_reset_tokens WHERE email=$1 AND used_at IS NULL', [email]);
    await db.query("INSERT INTO password_reset_tokens(email,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes')", [email, tokenHash]);
    await auth.sendPasswordResetEmail(email, token);
    await userActivity.logActivity(email, 'auth.password_reset_requested', req);
  } catch (error) {
    console.error('Password reset request failed:', error.message);
  }
  res.json(generic);
});

app.post('/api/auth/reset-password', authSecurity.enforcePasswordResetSubmitLimit, async (req, res) => {
  const token = String(req.body?.token || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!token) return res.status(400).json({ error: 'Reset link is invalid or expired', code: 'RESET_INVALID' });
  if (newPassword.length < 12 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return res.status(400).json({ error: 'Password must be at least 12 characters with uppercase, lowercase, and a number' });
  }
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetEmail = await db.withTransaction(async client => {
      const found = await client.query('SELECT id,email FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE', [tokenHash]);
      if (!found.rows[0]) return null;
      await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE id=$1', [found.rows[0].id]);
      await client.query('UPDATE users SET password_hash=$2,session_version=session_version+1 WHERE email=$1', [found.rows[0].email, credits.hashPassword(newPassword)]);
      await client.query('UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE email=$1', [found.rows[0].email]);
      return found.rows[0].email;
    });
    if (!resetEmail) return res.status(400).json({ error: 'Reset link is invalid or expired', code: 'RESET_INVALID' });
    await userActivity.logActivity(resetEmail, 'auth.password_reset_completed', req);
    res.clearCookie('token');
    res.json({ ok: true });
  } catch (error) {
    console.error('Password reset failed:', error.message);
    res.status(500).json({ error: 'Password could not be reset' });
  }
});

app.post('/api/auth/change-password', auth.authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const email = req.user.email;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  
  if (newPassword.length < 12 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return res.status(400).json({ error: 'Password must be at least 12 characters with uppercase, lowercase, and a number' });
  }
  
  try {
    const { rows } = await db.query('SELECT password_hash FROM users WHERE email=$1', [email]);
    if (!rows[0] || !rows[0].password_hash) {
      return res.status(400).json({ error: 'Password login not configured' });
    }
    
    const match = credits.verifyPassword(currentPassword, rows[0].password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    const newHash = credits.hashPassword(newPassword);
    // Revoke other devices, but keep this device signed in with a fresh token.
    const updated = await db.query('UPDATE users SET password_hash=$1, session_version=session_version+1 WHERE email=$2 RETURNING session_version', [newHash, email]);
    await db.query('UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE email=$1', [email]);
    await userActivity.logActivity(email, 'auth.password_changed', req);

    await auth.issueUserSession(req, res, { email, sessionVersion: updated.rows[0].session_version });
    res.json({ ok: true });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

app.put('/api/auth/profile', auth.authMiddleware, async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const displayName = String(req.body?.displayName || '').trim().replace(/\s+/g, ' ');
    const result = await credits.updateProfile(req.user.email, username, displayName);
    if (result.error) return res.status(result.code === 'USERNAME_TAKEN' ? 409 : 400).json({ error: result.error, code: result.code });
    await userActivity.logActivity(req.user.email, 'account.profile_updated', req, { usernameChanged: true, displayNameChanged: true });
    res.json({ ok: true, username: result.user.username, displayName: result.user.displayName });
  } catch (error) {
    console.error('Profile update failed:', error.message);
    res.status(500).json({ error: 'Profil tidak dapat diperbarui' });
  }
});

app.delete('/api/auth/delete-account', auth.authMiddleware, async (req, res) => {
  const email = req.user.email;
  
  try {
    await db.withTransaction(async client => {
      const active = await client.query("SELECT count(*)::int AS total FROM image_tasks WHERE email=$1 AND status IN ('queued','running')", [email]);
      if (active.rows[0].total > 0) throw Object.assign(new Error('Wait for or cancel active generations before deleting your account'), { status: 409 });
      await client.query("UPDATE image_results SET deleted_at=COALESCE(deleted_at,now()),deleted_by='account_deleted',owner_deleted_at=now(),is_favorite=false,result=jsonb_set(result,'{isPublic}','false'::jsonb,true) WHERE email=$1", [email]);
      await client.query('DELETE FROM users WHERE email=$1', [email]);
    });
    await userActivity.logActivity(email, 'auth.account_deleted', req);
    
    res.clearCookie('token');
    res.json({ ok: true });
  } catch (err) {
    console.error('Account deletion error:', err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to delete account' });
  }
});

app.post('/api/auth/admin', authLimiter, (req, res) => {
  const { password, totp } = req.body;
  if (password !== auth.ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid password' });
  if (!auth.verifyTOTP(totp)) return res.status(401).json({ error: 'Invalid authenticator code' });
  const jwtToken = auth.signJWT({ role: 'admin' });
  res.cookie('admintoken', jwtToken, auth.authCookie(req));
  res.json({ ok: true });
});

app.get('/api/admin/settings', auth.adminMiddleware, (req, res) => {
  const settingsData = settings.publicSettings();
  const metadata = settings.getSettingsMetadata();
  res.json({ settings: settingsData, metadata });
});

app.get('/api/help', (req, res) => {
  let rawNumber = String(process.env.WHATSAPP_DEVELOPER_NUMBER || '').replace(/\D/g, '');
  if (rawNumber.startsWith('00')) rawNumber = rawNumber.slice(2);
  const number = rawNumber ? (rawNumber.startsWith('0') ? `62${rawNumber.slice(1)}` : rawNumber) : '';
  let channelUrl = String(process.env.WHATSAPP_CHANNEL_URL || '').trim();
  try {
    const parsed = new URL(channelUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || !/whatsapp\.com$/i.test(parsed.hostname)) channelUrl = '';
  } catch (_) { channelUrl = ''; }
  res.json({
    developerNumber: number,
    developerUrl: number ? `https://wa.me/${number}` : '',
    channelUrl,
  });
});
app.put('/api/admin/settings', auth.adminMiddleware, (req, res) => {
  const values = req.body && typeof req.body === 'object' ? req.body : {};
  const invalid = Object.keys(values).filter(key => !settings.ALLOWED.has(key));
  if (invalid.length) return res.status(400).json({ error: `Unsupported setting: ${invalid[0]}` });
  const changes = settings.setMany(values, { admin: 'admin', ip: req.ip });
  audit.record(req, 'settings.save', 'settings', null, { fields: Object.keys(values), changes });
  const settingsData = settings.publicSettings();
  const metadata = settings.getSettingsMetadata();
  res.json({ ok: true, settings: settingsData, metadata, changes, note: 'Secrets are encrypted at rest. Restart is required for database/auth and startup-only settings.' });
});

app.get('/api/admin/settings/history', auth.adminMiddleware, (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const history = settings.getHistory(limit);
  res.json({ history });
});

app.post('/api/admin/settings/export', auth.adminMiddleware, (req, res) => {
  try {
    const exported = settings.exportSettings();
    audit.record(req, 'settings.export', 'settings', null);
    res.json({ ok: true, settings: exported, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/settings/import', auth.adminMiddleware, (req, res) => {
  try {
    const imported = req.body?.settings;
    if (!imported || typeof imported !== 'object') {
      return res.status(400).json({ error: 'Invalid settings format' });
    }
    const changes = settings.importSettings(imported, { admin: 'admin', ip: req.ip });
    audit.record(req, 'settings.import', 'settings', null, { count: changes.length });
    const settingsData = settings.publicSettings();
    const metadata = settings.getSettingsMetadata();
    res.json({ ok: true, changes, settings: settingsData, metadata, note: 'Settings imported. Restart may be required for some changes.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/settings/test', auth.adminMiddleware, async (req, res) => {
  const feature = String(req.body?.feature || '');
  const features = {
    database: ['DATABASE_URL'],
    telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CLIENT_ID', 'TELEGRAM_REDIRECT_URI'],
    email: ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'BREVO_API_KEY', 'BREVO_SENDER'],
    payments: ['PAKASIR_API_KEY', 'PAKASIR_PROJECT'],
    turnstile: ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'],
    capacity: ['MAX_CONCURRENT_GENERATIONS', 'MAX_QUEUED_GENERATIONS', 'MAX_USER_GENERATIONS', 'API_RATE_LIMIT_PER_MINUTE'],
  };
  const names = features[feature];
  if (!names) return res.status(400).json({ ok: false, error: 'Unsupported feature' });
  const results = [];
  try {
    const value = name => String(process.env[name] || '');
    if (feature === 'database') {
      if (!value('DATABASE_URL')) throw new Error('DATABASE_URL is not configured');
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: value('DATABASE_URL'), max: 1, connectionTimeoutMillis: 5000, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
      await pool.query('SELECT 1'); await pool.end();
      results.push({ name: 'PostgreSQL', ok: true, message: 'Connection successful' });
    } else if (feature === 'telegram') {
      if (!value('TELEGRAM_BOT_TOKEN')) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
      const response = await fetch(`https://api.telegram.org/bot${value('TELEGRAM_BOT_TOKEN')}/getMe`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.description || 'Telegram token rejected');
      if (!/^\d+$/.test(value('TELEGRAM_CLIENT_ID'))) throw new Error('TELEGRAM_CLIENT_ID must contain digits only');
      const redirect = new URL(value('TELEGRAM_REDIRECT_URI'));
      if (redirect.protocol !== 'https:') throw new Error('TELEGRAM_REDIRECT_URI must use HTTPS');
      results.push({ name: 'Telegram Login', ok: true, message: `Bot @${data.result.username} and OIDC configuration valid` });
    } else if (feature === 'email') {
      if (!/^\S+@\S+\.\S+$/.test(value('GMAIL_USER'))) throw new Error('GMAIL_USER is invalid');
      if (!value('GMAIL_APP_PASSWORD') && !value('BREVO_API_KEY')) throw new Error('Configure Gmail or Brevo credentials');
      results.push({ name: 'Email', ok: true, message: value('BREVO_API_KEY') ? 'Brevo configured' : 'Gmail SMTP configured' });
    } else if (feature === 'payments') {
      if (!value('PAKASIR_API_KEY') || !value('PAKASIR_PROJECT')) throw new Error('PAKASIR_API_KEY and PAKASIR_PROJECT are required');
      results.push({ name: 'Payments', ok: true, message: 'Pakasir configuration present' });
    } else if (feature === 'turnstile') {
      if (!value('TURNSTILE_SITE_KEY') || !value('TURNSTILE_SECRET_KEY')) throw new Error('TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are required');
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: value('TURNSTILE_SECRET_KEY'), response: 'admin-settings-configuration-test' }),
      });
      const data = await response.json();
      const errors = Array.isArray(data['error-codes']) ? data['error-codes'] : [];
      if (!response.ok || errors.includes('invalid-input-secret') || errors.includes('missing-input-secret')) throw new Error('Turnstile secret key was rejected');
      results.push({ name: 'Cloudflare Turnstile', ok: true, message: 'Keys are configured; widget activates automatically on register and password reset.' });
    } else if (feature === 'capacity') {
      for (const name of names) if (process.env[name] && (!Number.isFinite(Number(process.env[name])) || Number(process.env[name]) < 0)) throw new Error(`${name} must be a non-negative number`);
      results.push({ name: 'Capacity', ok: true, message: 'Limits are valid' });
    }
    audit.record(req, 'settings.test', 'settings', feature, { ok: true });
    res.json({ ok: true, results });
  } catch (error) { res.status(400).json({ ok: false, results, error: error.message || `${feature} test failed` }); }
});

app.get('/api/auth/me', auth.anyAuthMiddleware, async (req, res) => {
  if (req.user.role === 'admin') return res.json({ role: 'admin' });
  const user = await credits.getUser(req.user.email);
  res.json({
    email: req.user.email,
    role: req.user.role,
    credits: user?.credits ?? 0,
    unlimited: Boolean(user?.unlimited),
    freeTrial: Boolean(user?.freeTrial),
    unlimitedUntil: user?.unlimitedUntil || null,
    username: user?.username || null,
    displayName: user?.displayName || null,
    telegramUsername: user?.telegramUsername || null,
    telegramId: user?.telegramId || null,
    tosAccepted: Boolean(user?.tosAccepted),
  });
});

app.post('/api/auth/accept-tos', auth.authMiddleware, async (req, res) => {
  try {
    await db.query('UPDATE users SET tos_accepted = true WHERE email = $1', [req.user.email]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save agreement' });
  }
});

app.get('/api/auth/admin/me', auth.adminMiddleware, (req, res) => {
  res.json({ role: 'admin' });
});

app.get('/api/credits', auth.anyAuthMiddleware, async (req, res) => {
  const user = await credits.getUser(req.user.email);
  res.json({ credits: user?.credits ?? 0, totalCredits: user?.totalCredits ?? 0, unlimited: Boolean(user?.unlimited) });
});

app.get('/api/user/preferences', auth.authMiddleware, async (req, res) => {
  const { rows } = await db.query('SELECT preferences FROM users WHERE email=$1', [req.user.email]);
  res.json(rows[0]?.preferences || {});
});

app.put('/api/user/preferences', auth.authMiddleware, async (req, res) => {
  const { model, ratio } = req.body;
  await db.query('UPDATE users SET preferences = jsonb_set(jsonb_set(COALESCE(preferences,\'{}\'::jsonb), \'{model}\', $2::jsonb), \'{ratio}\', $3::jsonb) WHERE email=$1', [req.user.email, JSON.stringify(model || null), JSON.stringify(ratio || null)]);
  res.json({ ok: true });
});

app.get('/api/user/stats', auth.authMiddleware, async (req, res) => {
  try {
    const email = req.user.email;
    const [totalGeneratedResult, last7DaysResult, last30DaysResult, statusResult, modelResult, dailyResult] = await Promise.all([
      db.query("SELECT count(*)::int AS total FROM image_results WHERE email=$1 AND deleted_at IS NULL", [email]),
      db.query("SELECT count(*)::int AS total FROM image_tasks WHERE email=$1 AND status='done' AND created_at > now() - interval '7 days'", [email]),
      db.query("SELECT count(*)::int AS total FROM image_tasks WHERE email=$1 AND status='done' AND created_at > now() - interval '30 days'", [email]),
      db.query("SELECT status,count(*)::int AS total FROM image_tasks WHERE email=$1 GROUP BY status", [email]),
      db.query("SELECT model,count(*)::int AS total FROM image_tasks WHERE email=$1 AND status='done' GROUP BY model ORDER BY total DESC,model LIMIT 8", [email]),
      db.query("SELECT to_char(day,'YYYY-MM-DD') AS date,COALESCE(count(t.task_id),0)::int AS generations FROM generate_series(current_date-interval '13 days',current_date,interval '1 day') day LEFT JOIN image_tasks t ON t.email=$1 AND t.created_at>=day AND t.created_at<day+interval '1 day' GROUP BY day ORDER BY day", [email])
    ]);
    const statuses = Object.fromEntries(statusResult.rows.map(row => [row.status, row.total]));
    res.json({
      totalGenerated: totalGeneratedResult.rows[0].total,
      last7Days: last7DaysResult.rows[0].total,
      last30Days: last30DaysResult.rows[0].total,
      successCount: statuses.done || 0,
      failedCount: statuses.error || 0,
      cancelledCount: statuses.cancelled || 0,
      successRate: (statuses.done || 0) + (statuses.error || 0) > 0
        ? Math.round((statuses.done || 0) * 100 / ((statuses.done || 0) + (statuses.error || 0)))
        : 0,
      byModel: modelResult.rows,
      daily: dailyResult.rows
    });
  } catch (e) {
    console.error('User stats failed:', e.message);
    res.status(500).json({ error: 'Unable to load stats' });
  }
});

app.post('/api/vouchers/redeem', auth.authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });
    const result = await vouchers.redeem(code.toUpperCase(), req.user.email);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/vouchers', auth.adminMiddleware, async (req, res) => {
  res.json(await vouchers.listVouchers());
});

app.post('/api/admin/vouchers', auth.adminMiddleware, async (req, res) => {
  try {
    res.json(await vouchers.createVoucher(req.body));
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

app.delete('/api/admin/vouchers/:id', auth.adminMiddleware, async (req, res) => {
  await vouchers.deleteVoucher(parseInt(req.params.id));
  res.json({ ok: true });
});

app.post('/api/topup', auth.authMiddleware, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount < 1) return res.status(400).json({ error: 'Invalid amount' });
  try {
    const result = await payments.createTopup(req.user.email, amount);
    await userActivity.logActivity(req.user.email, 'payment.topup', req, { credits: amount, amount: result.amount });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get('/api/pricing', async (req, res) => {
  res.json({ plans: await plans.getActivePlans() });
});

app.get('/api/plans', async (req, res) => {
  res.json(await plans.getActivePlans());
});

app.get('/api/banner', auth.anyAuthMiddleware, async (req, res) => {
  const messages = [
    { id: 'ref-label', text: 'Klik gambar referensi untuk menyisipkan namanya ke prompt.', icon: 'image' },
    { id: 'voice', text: 'Voice-to-text tersedia! Klik ikon mik untuk dikte prompt.', icon: 'mic' },
    { id: 'ref-dedup', text: 'Upload referensi yang sama tidak akan menggandakan penyimpanan.', icon: 'zap' },
  ];
  const geminiTargets = new Set(['polosansatu@ccmail.uk','masterpiecemks@gmail.com','g.aryansyah9@gmail.com']);
  if (req.user?.email && geminiTargets.has(req.user.email)) {
    messages.push({ id: 'gemini-offer', text: 'Penawaran khusus: Google Gemini 18 bulan akses unlimited. Hubungi admin untuk info lebih lanjut.', icon: 'star' });
  }
  res.json({ messages });
});

// Suspended-user offer flow: accept (provide personal email) or reject.
app.post('/api/auth/offer-response', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const action = req.body?.action === 'accept' ? 'accept' : 'reject';
  const contactEmail = String(req.body?.contactEmail || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
  if (action === 'accept' && !/^\S+@\S+\.\S+$/.test(contactEmail)) return res.status(400).json({ error: 'Please provide a valid contact email' });
  const user = await db.query('SELECT email, suspension_reason FROM users WHERE email=$1 AND suspended_at IS NOT NULL', [email]);
  if (!user.rows[0]) return res.status(404).json({ error: 'No pending offer' });
  await db.query('INSERT INTO offer_responses(email,contact_email,action,created_at) VALUES($1,$2,$3,now())', [email, action === 'accept' ? contactEmail : null, action]);
  res.json({ ok: true, action });
});

app.get('/api/admin/offer-responses', auth.adminMiddleware, async (req, res) => {
  const { rows } = await db.query('SELECT id, email, contact_email, action, created_at FROM offer_responses ORDER BY created_at DESC');
  res.json({ responses: rows });
});

app.post('/api/subscriptions/unlimited', auth.authMiddleware, async (req, res) => {
  try {
    const { planSlug } = req.body;
    if (!planSlug) return res.status(400).json({ error: 'planSlug is required' });
    res.json(await payments.createSubscription(req.user.email, planSlug));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/subscriptions/unlimited30', auth.authMiddleware, async (req, res) => {
  try {
    res.json(await payments.createSubscription(req.user.email, 'unlimited_30d'));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/subscriptions/unlimited7', auth.authMiddleware, async (req, res) => {
  try {
    res.json(await payments.createSubscription(req.user.email, 'unlimited_7d'));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/topup/webhook', async (req, res) => {
  const secret = process.env.PAKASIR_WEBHOOK_SECRET;
  const suppliedSecret = req.get('x-pakasir-webhook-secret');
  // Pakasir's documented webhook does not include a custom secret header.
  // If one is supplied by an intermediary, still validate it; payment status
  // and amount are independently verified against Pakasir before fulfillment.
  if (secret && suppliedSecret && suppliedSecret !== secret) return res.status(401).json({ error: 'Invalid webhook secret' });
  try {
    res.json(await payments.processWebhook(req.body?.order_id, req.body?.status, req.body?.amount));
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

// Payment simulation endpoint for testing (Sandbox mode only)
app.post('/api/topup/simulate', auth.adminMiddleware, async (req, res) => {
  const { order_id, amount } = req.body;
  if (!order_id || !amount) return res.status(400).json({ error: 'order_id and amount required' });
  
  const pakasirKey = process.env.PAKASIR_API_KEY;
  const project = process.env.PAKASIR_PROJECT;
  if (!pakasirKey || !project) return res.status(500).json({ error: 'Pakasir not configured' });

  try {
    const resp = await fetch('https://app.pakasir.com/api/paymentsimulation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, order_id, amount: Number(amount), api_key: pakasirKey }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(502).json({ error: 'Simulation failed', details: data });
    res.json({ ok: true, message: 'Payment simulated, webhook should be triggered', data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cancel payment endpoint
app.post('/api/payments/:orderId/cancel', auth.authMiddleware, async (req, res) => {
  try {
    const payment = await payments.listPayments(req.user.email, 1, 1000);
    const found = payment.items.find(p => p.orderId === req.params.orderId);
    if (!found) return res.status(404).json({ error: 'Payment not found' });
    if (found.status !== 'pending') return res.status(400).json({ error: 'Can only cancel pending payments' });
    
    res.json(await payments.cancelPayment(req.params.orderId, found.amount));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get('/api/admin/users', auth.adminMiddleware, async (req, res) => {
  const { query } = require('./src/db');
  const paginated = req.query.page !== undefined || req.query.limit !== undefined || req.query.q !== undefined || req.query.suspended !== undefined || req.query.verified !== undefined || req.query.credits !== undefined || req.query.activity !== undefined || req.query.sort !== undefined;
  
  if (!paginated) return res.json(await credits.getAllUsers());
  
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const searchQuery = String(req.query.q || '').slice(0, 200);
  const suspended = req.query.suspended === undefined ? undefined : req.query.suspended === 'true';
  const verified = req.query.verified === undefined ? undefined : req.query.verified === 'true';
  const creditFilter = req.query.credits;
  const activityFilter = req.query.activity;
  const sortBy = req.query.sort || 'created_at';
  
  const params = [];
  const where = [];
  
  // Search filter
  if (searchQuery) {
    params.push(`%${searchQuery.toLowerCase()}%`);
    where.push(`(LOWER(email) LIKE $${params.length} OR LOWER(username) LIKE $${params.length} OR LOWER(display_name) LIKE $${params.length})`);
  }
  
  // Suspended filter
  if (suspended !== undefined) {
    where.push(suspended ? 'suspended_at IS NOT NULL' : 'suspended_at IS NULL');
  }
  
  // Verified filter
  if (verified !== undefined) {
    where.push(verified ? 'email_verified_at IS NOT NULL' : 'email_verified_at IS NULL');
  }
  
  // Credits filter
  if (creditFilter === 'zero') where.push('credits = 0 AND unlimited = false');
  else if (creditFilter === 'low') where.push('credits BETWEEN 1 AND 10 AND unlimited = false');
  else if (creditFilter === 'medium') where.push('credits BETWEEN 11 AND 50 AND unlimited = false');
  else if (creditFilter === 'high') where.push('credits > 50 AND unlimited = false');
  else if (creditFilter === 'unlimited') where.push('unlimited = true');
  
  // Activity filter
  if (activityFilter === 'active_7d') where.push("last_login > now() - interval '7 days'");
  else if (activityFilter === 'inactive_30d') where.push("last_login < now() - interval '30 days' OR last_login IS NULL");
  
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  
  // Sort
  let orderBy = 'created_at DESC';
  if (sortBy === 'credits_desc') orderBy = 'credits DESC, created_at DESC';
  else if (sortBy === 'credits_asc') orderBy = 'credits ASC, created_at DESC';
  else if (sortBy === 'last_login') orderBy = 'last_login DESC NULLS LAST, created_at DESC';
  else if (sortBy === 'total_images') orderBy = 'total_images DESC NULLS LAST, created_at DESC';
  
  const offset = (page - 1) * limit;
  params.push(limit, offset);
  
  try {
    const countResult = await query(`SELECT COUNT(*)::int as total FROM users ${whereClause}`, params.slice(0, -2));
    const users = await query(`
      SELECT 
        email, credits, total_credits, 
        COALESCE((SELECT SUM(t.cost) FROM image_tasks t WHERE t.email=users.email AND t.status='done'),0)::int as total_spent,
        unlimited, signup_ip, created_at, last_login,
        email_verified_at, suspended_at, suspension_reason,
        tags, admin_notes, total_images, last_generation_at
      FROM users ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    
    res.json({
      items: users.rows.map(u => ({
        email: u.email,
        credits: u.credits,
        totalCredits: u.total_credits,
        totalSpent: u.total_spent,
        unlimited: u.unlimited,
        signupIP: u.signup_ip,
        createdAt: u.created_at,
        lastLogin: u.last_login,
        emailVerifiedAt: u.email_verified_at,
        suspendedAt: u.suspended_at,
        suspensionReason: u.suspension_reason,
        tags: u.tags,
        adminNotes: u.admin_notes,
        totalImages: u.total_images,
        lastGenerationAt: u.last_generation_at
      })),
      total: countResult.rows[0].total,
      page,
      limit
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/user/:email/unlimited', auth.adminMiddleware, async (req, res) => {
  const { query } = require('./src/db');
  const unlimited = Boolean(req.body?.unlimited);
  const result = await query('UPDATE users SET unlimited=$2 WHERE email=$1 RETURNING email,unlimited', [req.params.email, unlimited]);
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  await audit.record(req, 'user.unlimited', 'user', req.params.email, { unlimited });
  res.json({ ok: true, ...result.rows[0] });
});

app.get('/api/admin/transactions', auth.adminMiddleware, async (req, res) => {
  res.json(await credits.getAllTransactions());
});

app.get('/api/admin/user/:email', auth.adminMiddleware, async (req, res) => {
  const user = await credits.getUser(req.params.email);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const history = await credits.getCreditHistory(req.params.email);
  const spent = await db.query("SELECT COALESCE(SUM(cost),0)::int AS total FROM image_tasks WHERE email=$1 AND status='done'", [req.params.email]);
  res.json({ user: { email: user.email, credits: user.credits, totalCredits: user.totalCredits, totalSpent: spent.rows[0].total, signupIP: user.signupIP, createdAt: user.createdAt, lastLogin: user.lastLogin }, transactions: history });
});

app.get('/api/admin/credits', auth.adminMiddleware, async (req, res) => {
  res.json(await credits.getTotalCredits());
});

app.post('/api/admin/user/:email/credits', auth.adminMiddleware, async (req, res) => {
  const amount = parseInt(req.body?.amount, 10);
  if (!Number.isInteger(amount) || amount === 0) return res.status(400).json({ error: 'amount must be a non-zero integer' });
  const ok = amount > 0 ? await credits.addCredits(req.params.email, amount, 'admin_adjustment') : await credits.deductCredits(req.params.email, Math.abs(amount), 'admin_adjustment');
  if (!ok) return res.status(404).json({ error: 'User not found or insufficient credits' });
  await audit.record(req, 'user.credits', 'user', req.params.email, { amount });
  const user = await credits.getUser(req.params.email);
  res.json({ ok: true, credits: user?.credits ?? 0, totalCredits: user?.totalCredits ?? 0 });
});

app.get('/api/admin/tasks/active', auth.adminMiddleware, async (req, res) => {
  const tasks = await generation.getActiveTasks();
  res.json(tasks);
});

app.delete('/api/admin/user/:email', auth.adminMiddleware, async (req, res) => {
  const { query } = require('./src/db');
  const active = await query("SELECT count(*)::int AS total FROM image_tasks WHERE email=$1 AND status IN ('queued','running')", [req.params.email]);
  if (active.rows[0].total > 0) return res.status(409).json({ error: 'User has active generations. Cancel or wait for them before deleting the account.' });
  await query("UPDATE image_results SET deleted_at=COALESCE(deleted_at,now()),deleted_by='admin_account_delete',owner_deleted_at=now(),is_favorite=false,result=jsonb_set(result,'{isPublic}','false'::jsonb,true) WHERE email=$1", [req.params.email]);
  const result = await query('DELETE FROM users WHERE email = $1 RETURNING email', [req.params.email]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
  await audit.record(req, 'user.delete', 'user', req.params.email);
  res.json({ ok: true });
});

app.patch('/api/admin/user/:email/suspension', auth.adminMiddleware, async (req, res) => {
  const suspended = Boolean(req.body?.suspended);
  const reason = String(req.body?.reason || '').slice(0, 500);
  const { rows } = await db.query('UPDATE users SET suspended_at=CASE WHEN $2 THEN now() ELSE NULL END,suspension_reason=CASE WHEN $2 THEN $3 ELSE NULL END,session_version=session_version+1 WHERE email=$1 RETURNING email,suspended_at AS "suspendedAt",suspension_reason AS "suspensionReason"', [req.params.email, suspended, reason]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  await audit.record(req, 'user.suspension', 'user', req.params.email, { suspended, reason });
  res.json({ ok: true, ...rows[0] });
});

app.post('/api/auth/logout-all', auth.authMiddleware, async (req, res) => {
  await db.query('UPDATE users SET session_version=session_version+1 WHERE email=$1', [req.user.email]);
  await db.query('UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE email=$1', [req.user.email]);
  await userActivity.logActivity(req.user.email, 'auth.logout_all', req);
  res.clearCookie('token'); res.json({ ok: true });
});

app.get('/api/auth/sessions', auth.authMiddleware, async (req, res) => {
  const { rows } = await db.query(
    `SELECT id,ip::text,user_agent AS "userAgent",created_at AS "createdAt",last_seen_at AS "lastSeenAt",expires_at AS "expiresAt"
     FROM user_sessions WHERE email=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY last_seen_at DESC`,
    [req.user.email],
  );
  res.json({
    items: rows.map(session => ({ ...session, current: session.id === req.sessionId })),
    legacySession: !req.sessionId,
  });
});

app.delete('/api/auth/sessions/:id', auth.authMiddleware, async (req, res) => {
  const id = String(req.params.id || '');
  const revoked = await db.query(
    'UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND email=$2 RETURNING id',
    [id, req.user.email],
  );
  if (!revoked.rows[0]) return res.status(404).json({ error: 'Session not found' });
  await userActivity.logActivity(req.user.email, 'auth.session_revoked', req, { sessionId: id.slice(0, 8) });
  if (id === req.sessionId) res.clearCookie('token');
  res.json({ ok: true, current: id === req.sessionId });
});

app.post('/api/admin/user/:email/revoke-sessions', auth.adminMiddleware, async (req, res) => {
  const result = await db.query('UPDATE users SET session_version=session_version+1 WHERE email=$1 RETURNING email,session_version AS "sessionVersion"', [req.params.email]);
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  await db.query('UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE email=$1', [req.params.email]);
  await audit.record(req, 'user.revoke_sessions', 'user', req.params.email);
  res.json({ ok: true, ...result.rows[0] });
});

app.post('/api/auth/logout', async (req, res) => {
  // Determine which cookie to clear based on the token used
  const hasUserToken = req.cookies?.token;
  const hasAdminToken = req.cookies?.admintoken;
  
  const sessionUser = await auth.revokeRequestSession(req).catch(() => null);
  if (sessionUser?.email) userActivity.logActivity(sessionUser.email, 'auth.logout', req);
  
  // Only clear the cookie that was used for this request
  if (hasUserToken) {
    res.clearCookie('token');
  }
  if (hasAdminToken && auth.verifyJWT(hasAdminToken)?.role === 'admin') res.clearCookie('admintoken');
  
  res.json({ ok: true });
});

// Telegram login + bot webhook
app.post('/api/auth/telegram', (req, res) => telegram.handleTelegramLogin(req, res));
app.get('/api/auth/telegram', (req, res) => telegram.handleTelegramLogin(req, res));
app.get('/api/auth/telegram/start', (req, res) => telegram.startTelegramLogin(req, res));
app.get('/api/auth/telegram/callback', (req, res) => telegram.handleTelegramCallback(req, res));
app.get('/api/auth/telegram/config', (req, res) => telegram.handleTelegramConfig(req, res));
app.post('/api/telegram/webhook', (req, res) => telegram.handleTelegramWebhook(req, res));
app.post('/api/telegram/setup', auth.adminMiddleware, (req, res) => telegram.setupTelegramWebhook(req, res));


// ========== ENHANCED USER MANAGEMENT ENDPOINTS ==========

// Get user statistics
app.get('/api/admin/users/stats', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const stats = await query(`
      SELECT 
        COUNT(*)::int as total_users,
        COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int as new_users_week,
        COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int as new_users_month,
        COUNT(*) FILTER (WHERE last_login > now() - interval '7 days')::int as active_users_week,
        COUNT(*) FILTER (WHERE suspended_at IS NOT NULL)::int as suspended_users,
        COUNT(*) FILTER (WHERE email_verified_at IS NULL)::int as unverified_users,
        COUNT(*) FILTER (WHERE unlimited = true)::int as unlimited_users,
        COUNT(*) FILTER (WHERE credits = 0)::int as zero_credit_users,
        COALESCE(SUM(credits), 0)::int as total_credits,
        COALESCE(SUM(total_credits), 0)::int as total_credits_distributed,
        COALESCE(AVG(credits), 0)::numeric(10,2) as avg_credits,
        COALESCE(SUM(total_images), 0)::int as total_images_generated
      FROM users
    `);
    res.json(stats.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get user detail with full history
app.get('/api/admin/user/:email/detail', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const email = req.params.email;
    
    const [user, transactions, images, activity, payments] = await Promise.all([
      query('SELECT * FROM users WHERE email = $1', [email]),
      query('SELECT * FROM transactions WHERE email = $1 ORDER BY time DESC LIMIT 50', [email]),
      query(`SELECT task_id, result, created_at FROM image_results WHERE email = $1 ORDER BY created_at DESC LIMIT 20`, [email]),
      query('SELECT * FROM user_activity_log WHERE email = $1 ORDER BY created_at DESC LIMIT 50', [email]),
      query('SELECT * FROM payments WHERE email = $1 ORDER BY created_at DESC LIMIT 20', [email])
    ]);
    
    if (!user.rows[0]) return res.status(404).json({ error: 'User not found' });
    
    // Get image stats
    const imageStats = await query(`
      SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int as last_7_days,
        COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int as last_30_days,
        result->>'model' as model,
        COUNT(*)::int as model_count
      FROM image_results 
      WHERE email = $1
      GROUP BY result->>'model'
      ORDER BY model_count DESC
    `, [email]);
    
    res.json({
      user: user.rows[0],
      transactions: transactions.rows,
      images: images.rows.map(r => ({
        taskId: r.task_id,
        model: r.result?.model,
        prompt: r.result?.originalPrompt || r.result?.prompt,
        url: `/api/media/result/${r.task_id}`,
        createdAt: r.created_at
      })),
      activity: activity.rows,
      payments: payments.rows,
      imageStats: imageStats.rows
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update user metadata (tags, notes)
app.patch('/api/admin/user/:email/metadata', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const email = req.params.email;
    const { tags, adminNotes } = req.body;
    
    const updates = [];
    const params = [email];
    
    if (tags !== undefined) {
      params.push(tags);
      updates.push(`tags = $${params.length}`);
    }
    if (adminNotes !== undefined) {
      params.push(adminNotes);
      updates.push(`admin_notes = $${params.length}`);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    const result = await query(`
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE email = $1
      RETURNING email, tags, admin_notes
    `, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    await audit.record(req, 'user.metadata_update', 'user', email, { tags, adminNotes });
    res.json({ ok: true, user: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk add credits
app.post('/api/admin/users/bulk-credits', auth.adminMiddleware, async (req, res) => {
  try {
    const { emails, amount } = req.body;
    
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'emails array is required' });
    }
    
    const amountInt = parseInt(amount);
    if (!Number.isInteger(amountInt) || amountInt === 0) {
      return res.status(400).json({ error: 'amount must be a non-zero integer' });
    }
    
    const results = { success: 0, failed: 0, errors: [] };
    
    for (const email of emails) {
      try {
        const ok = amountInt > 0 
          ? await credits.addCredits(email, amountInt, 'bulk_admin_adjustment')
          : await credits.deductCredits(email, Math.abs(amountInt), 'bulk_admin_adjustment');
        
        if (ok) results.success++;
        else {
          results.failed++;
          results.errors.push({ email, error: 'User not found or insufficient credits' });
        }
      } catch (e) {
        results.failed++;
        results.errors.push({ email, error: e.message });
      }
    }
    
    await audit.record(req, 'user.bulk_credits', 'user', null, { count: emails.length, amount: amountInt, ...results });
    res.json({ ok: true, ...results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk suspend
app.post('/api/admin/users/bulk-suspend', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const { emails, suspend, reason } = req.body;
    
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'emails array is required' });
    }
    
    const result = await query(`
      UPDATE users 
      SET suspended_at = CASE WHEN $2 THEN now() ELSE NULL END,
          suspension_reason = CASE WHEN $2 THEN $3 ELSE NULL END,
          session_version = session_version + 1
      WHERE email = ANY($1::text[])
      RETURNING email, suspended_at
    `, [emails, !!suspend, reason || null]);
    
    await audit.record(req, 'user.bulk_suspend', 'user', null, { count: result.rows.length, suspend, reason });
    res.json({ ok: true, updated: result.rows.length, users: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk delete users
app.post('/api/admin/users/bulk-delete', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const { emails } = req.body;
    
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'emails array is required' });
    }
    
    const active = await query("SELECT DISTINCT email FROM image_tasks WHERE email=ANY($1::text[]) AND status IN ('queued','running')", [emails]);
    if (active.rows.length > 0) return res.status(409).json({ error: `Active generations exist for: ${active.rows.map(row => row.email).join(', ')}` });
    await query("UPDATE image_results SET deleted_at=COALESCE(deleted_at,now()),deleted_by='admin_bulk_account_delete',owner_deleted_at=now(),is_favorite=false,result=jsonb_set(result,'{isPublic}','false'::jsonb,true) WHERE email=ANY($1::text[])", [emails]);
    const result = await query('DELETE FROM users WHERE email = ANY($1::text[]) RETURNING email', [emails]);
    
    await audit.record(req, 'user.bulk_delete', 'user', null, { count: result.rows.length, emails });
    res.json({ ok: true, deleted: result.rows.length, users: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Export users to CSV
app.get('/api/admin/users/export', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const users = await query(`
      SELECT email, credits, total_credits, unlimited, email_verified_at, 
             suspended_at, suspension_reason, signup_ip, created_at, last_login,
             total_images, tags, admin_notes
      FROM users 
      ORDER BY created_at DESC
    `);
    
    const csv = [
      'email,credits,total_credits,unlimited,verified,suspended,signup_ip,created_at,last_login,total_images,tags,notes',
      ...users.rows.map(u => [
        u.email,
        u.credits,
        u.total_credits,
        u.unlimited,
        u.email_verified_at ? 'yes' : 'no',
        u.suspended_at ? 'yes' : 'no',
        u.signup_ip || '',
        u.created_at,
        u.last_login,
        u.total_images || 0,
        `"${(u.tags || []).join(',')}"`,
        `"${(u.admin_notes || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="users-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get users by IP (find duplicates)
app.get('/api/admin/users/by-ip/:ip', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const ip = req.params.ip;
    
    const users = await query(`
      SELECT email, credits, created_at, last_login, email_verified_at, suspended_at
      FROM users 
      WHERE signup_ip = $1 OR last_ip = $1
      ORDER BY created_at DESC
    `, [ip]);
    
    res.json({ ip, count: users.rows.length, users: users.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Block IP address
app.post('/api/admin/block-ip', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const { ip, reason } = req.body;
    
    if (!ip) return res.status(400).json({ error: 'ip is required' });
    
    await query(`
      INSERT INTO blocked_ips (ip, reason, blocked_by)
      VALUES ($1, $2, 'admin')
      ON CONFLICT (ip) DO UPDATE SET reason = $2
    `, [ip, reason || null]);
    
    await audit.record(req, 'ip.block', 'ip', ip, { reason });
    res.json({ ok: true, ip, reason });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Unblock IP address
app.delete('/api/admin/block-ip/:ip', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const ip = req.params.ip;
    
    await query('DELETE FROM blocked_ips WHERE ip = $1', [ip]);
    await audit.record(req, 'ip.unblock', 'ip', ip);
    res.json({ ok: true, ip });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get blocked IPs
app.get('/api/admin/blocked-ips', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const ips = await query('SELECT * FROM blocked_ips ORDER BY created_at DESC');
    res.json(ips.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send email to user (placeholder - needs email service)
app.post('/api/admin/user/:email/send-message', auth.adminMiddleware, async (req, res) => {
  try {
    const { subject, message } = req.body;
    const email = req.params.email;
    
    // TODO: Implement actual email sending
    // For now, just log it
    await audit.record(req, 'user.send_message', 'user', email, { subject, message });
    
    res.json({ ok: true, message: 'Email queued (feature pending implementation)' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== KEY POOL ROUTES ==========

app.post('/api/pool/signup', auth.adminMiddleware, async (req, res) => {
  const count = Number(req.body?.count ?? 1);
  const threads = Number(req.body?.threads ?? 3);
  const maxCount = config.MAX_POOL_SIGNUP_COUNT;
  if (!Number.isInteger(count) || count < 1 || count > maxCount) return res.status(400).json({ error: `Count must be between 1 and ${maxCount}` });
  if (!Number.isInteger(threads) || threads < 1 || threads > config.MAX_SIGNUP_THREADS) return res.status(400).json({ error: `Threads must be between 1 and ${config.MAX_SIGNUP_THREADS} on this VPS` });
  const { query } = require('./src/db');
  const active = await query("SELECT id FROM signup_batches WHERE status = 'running' ORDER BY created_at DESC LIMIT 1");
  if (active.rows[0]) return res.status(409).json({ error: 'A signup batch is already running', batchId: active.rows[0].id });
  const batchId = 'signup_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  await query('INSERT INTO signup_batches(id,total,threads) VALUES($1,$2,$3)', [batchId, count, threads]);
  for (let i = 0; i < count; i++) await query('INSERT INTO signup_batch_items(batch_id,position) VALUES($1,$2)', [batchId, i + 1]);
  const pool = await poolModule.listKeys();
  const results = [];
  let success = 0, fail = 0, done = 0;
  const total = count;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  function send(data) {
    res.write('data: ' + JSON.stringify(data) + '\n\n');
  }
  const concurrency = Math.min(threads, count);
  await audit.record(req, 'signup.start', 'signup_batch', batchId, { count, threads: concurrency });
  send({ type: 'start', batchId, total, threads: concurrency });

  async function runOne(threadId) {
    while (done < total) {
      const current = await query('SELECT status FROM signup_batches WHERE id=$1', [batchId]);
      if (current.rows[0]?.status !== 'running') break;
      const i = done++;
      if (i >= total) break;
      const position = i + 1;
      const email = signup.generateEmail();
      await query('UPDATE signup_batch_items SET thread_id=$2,email=$3,status=$4,step=$5,updated_at=now() WHERE batch_id=$1 AND position=$6', [batchId, threadId, email, 'running', 'Opening browser', position]);
      const keyName = String(pool.length + results.length + 1);
      const pct = Math.round((i / total) * 100);
      send({ type: 'thread', threadId, index: i + 1, total, email, status: 'navigate', progress: pct, step: 'Opening browser' });
      try {
        const beforeSignup = await query('SELECT status FROM signup_batches WHERE id=$1', [batchId]);
        if (beforeSignup.rows[0]?.status !== 'running') break;
        const key = await signup.signupFull(email, keyName, (step) => {
          const labels = { navigate: 'Opening site', form: 'Filling email', otp_wait: 'Waiting OTP', otp_verify: 'Verifying OTP', apikey: 'Creating API key' };
          const label = labels[step] || step;
          query('UPDATE signup_batch_items SET status=$3,step=$4,updated_at=now() WHERE batch_id=$1 AND position=$2', [batchId, position, step, label]).catch(() => {});
          send({ type: 'thread', threadId, index: i + 1, total, email, status: step, progress: pct, step: label });
        });
        send({ type: 'thread', threadId, index: i + 1, total, email, status: 'credit', progress: pct, step: 'Fetching balance' });
        let balance = 20;
        try {
          const out = await poolModule.runCLI(['account', 'status', '--json'], { RENOISE_API_KEY: key });
          const data = JSON.parse(out);
          balance = data.credit?.balance ?? 20;
        } catch (e) {}
        const entry = { email, key, balance, createdAt: new Date().toISOString() };
        pool.push(entry);
        results.push(entry);
        success++;
        await poolModule.addKey(email, key, balance);
        await query('UPDATE signup_batch_items SET status=$3,step=$4,api_key=$5,balance=$6,updated_at=now() WHERE batch_id=$1 AND position=$2', [batchId, position, 'ok', 'Completed', key, balance]);
        send({ type: 'thread', threadId, index: i + 1, total, email, key, status: 'ok', progress: Math.round(((i + 1) / total) * 100), balance });
      } catch (e) {
        fail++;
        results.push({ email, key: null, error: e.message });
        await query('UPDATE signup_batch_items SET status=$3,step=$4,error=$5,updated_at=now() WHERE batch_id=$1 AND position=$2', [batchId, position, 'fail', 'Failed', e.message]);
        send({ type: 'thread', index: i + 1, total, email, error: e.message, status: 'fail', progress: Math.round(((i + 1) / total) * 100) });
      }
    }
  }

  const workers = [];
  for (let w = 0; w < concurrency; w++) workers.push(runOne(w + 1));
  await Promise.all(workers);

  const finalBatch = await query('SELECT status FROM signup_batches WHERE id=$1', [batchId]);
  if (finalBatch.rows[0]?.status === 'running') await query("UPDATE signup_batches SET status='completed',success=$2,failed=$3,finished_at=now() WHERE id=$1", [batchId, success, fail]);
  send({ type: 'done', batchId, success, fail, results, poolSize: pool.length });
  res.end();
});

app.post('/api/pool/signup/stop', auth.adminMiddleware, async (req, res) => {
  const { query } = require('./src/db');
  const batchId = String(req.body?.batchId || '');
  if (!batchId) return res.status(400).json({ error: 'batchId is required' });
  const result = await query("UPDATE signup_batches SET status='stopped',finished_at=now() WHERE id=$1 AND status='running' RETURNING id", [batchId]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Running batch not found' });
  await query("UPDATE signup_batch_items SET status='stopped',step='Stopped',updated_at=now() WHERE batch_id=$1 AND status IN ('queued','running')", [batchId]);
  await audit.record(req, 'signup.stop', 'signup_batch', batchId);
  res.json({ ok: true, batchId });
});

app.get('/api/pool/signup/status', auth.adminMiddleware, async (req, res) => {
  const { query } = require('./src/db');
  const batch = await query("SELECT * FROM signup_batches ORDER BY created_at DESC LIMIT 1");
  if (!batch.rows[0]) return res.json(null);
  const items = await query('SELECT position,thread_id AS "threadId",email,status,step,balance,error,updated_at AS "updatedAt" FROM signup_batch_items WHERE batch_id=$1 ORDER BY position', [batch.rows[0].id]);
  res.json({ ...batch.rows[0], items: items.rows });
});

// Get all generated accounts from signup
app.get('/api/pool/signup/accounts', auth.adminMiddleware, async (req, res) => {
  const { query } = require('./src/db');
  const accounts = await query('SELECT email, balance, created_at AS "createdAt" FROM api_keys ORDER BY created_at DESC');
  res.json({ accounts: accounts.rows });
});

// Delete account
app.delete('/api/pool/signup/accounts', auth.adminMiddleware, async (req, res) => {
  const { query } = require('./src/db');
  const email = String(req.body?.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email is required' });
  await query('DELETE FROM api_keys WHERE email=$1', [email]);
  await audit.record(req, 'signup.delete_account', 'account', email);
  res.json({ ok: true });
});

// Get batch history
app.get('/api/pool/signup/history', auth.adminMiddleware, async (req, res) => {
  const { query } = require('./src/db');
  const batches = await query(`
    SELECT 
      id, 
      total, 
      success, 
      failed, 
      threads,
      created_at AS "createdAt", 
      finished_at AS "finishedAt",
      EXTRACT(EPOCH FROM (finished_at - created_at))::int AS duration,
      CASE WHEN total > 0 THEN ROUND((success::numeric / total::numeric) * 100)::int ELSE 0 END AS "successRate"
    FROM signup_batches 
    WHERE status IN ('completed', 'stopped')
    ORDER BY created_at DESC 
    LIMIT 50
  `);
  res.json({ history: batches.rows });
});

// Get signup stats
app.get('/api/pool/signup/stats', auth.adminMiddleware, async (req, res) => {
  const { query } = require('./src/db');
  const [accounts, batches, avgTime] = await Promise.all([
    query('SELECT count(*)::int AS total, COALESCE(sum(balance), 0)::int AS credits FROM api_keys'),
    query('SELECT count(*)::int AS total FROM signup_batches WHERE status IN (\'completed\', \'stopped\')'),
    query('SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (finished_at - created_at))), 0)::int AS avg FROM signup_batches WHERE status = \'completed\' AND total > 0'),
  ]);
  const totalAccounts = accounts.rows[0]?.total || 0;
  const totalBatches = batches.rows[0]?.total || 0;
  const avgSeconds = avgTime.rows[0]?.avg || 0;
  const avgPerAccount = totalAccounts > 0 && avgSeconds > 0 ? Math.round(avgSeconds / (totalAccounts / Math.max(1, totalBatches))) : 0;
  res.json({
    totalAccounts,
    totalCredits: accounts.rows[0]?.credits || 0,
    totalBatches,
    avgTime: avgPerAccount,
  });
});

app.get('/api/pool', auth.adminMiddleware, async (req, res) => {
  const pool = await poolModule.listKeys();
  const masked = pool.map((k, i) => ({
    index: i + 1,
    email: k.email ? k.email.replace(/(.{3}).*(@.*)/, '$1***$2') : 'unknown',
    key: k.key ? k.key.substring(0, 8) + '...' : 'FAILED',
    balance: typeof k.balance === 'number' ? k.balance : 0,
    exhausted: !!k.exhausted,
    healthStatus: k.healthStatus,
    healthMessage: k.healthMessage,
    lastCheckedAt: k.lastCheckedAt,
    createdAt: k.createdAt,
  }));
  res.json(masked);
});

app.get('/api/admin/pool/stats', auth.adminMiddleware, async (req, res) => {
  const { query } = require('./src/db');
  const [poolStats, userStats, usageStats, byKey, recent] = await Promise.all([
    query('SELECT count(*)::int AS keys, COALESCE(sum(balance), 0)::int AS credits, count(*) FILTER (WHERE exhausted)::int AS exhausted FROM api_keys'),
    query('SELECT count(*)::int AS users, COALESCE(sum(credits), 0)::int AS credits FROM users'),
    query("SELECT count(*)::int AS generations, COALESCE(sum(COALESCE((result->>'estimatedCredit')::int, 0)), 0)::int AS spent, count(DISTINCT email)::int AS users FROM image_results"),
    query("SELECT COALESCE(result->>'usedKey', 'unknown') AS key, count(*)::int AS generations, COALESCE(sum(COALESCE((result->>'estimatedCredit')::int, 0)), 0)::int AS spent FROM image_results GROUP BY 1 ORDER BY spent DESC"),
    query("SELECT task_id AS \"taskId\", email, COALESCE((result->>'model'), '') AS model, COALESCE((result->>'estimatedCredit')::int, 0) AS cost, created_at AS time FROM image_results ORDER BY created_at DESC LIMIT 100"),
  ]);
  res.json({
    pool: poolStats.rows[0],
    users: userStats.rows[0],
    usage: usageStats.rows[0],
    byKey: byKey.rows,
    recent: recent.rows,
  });
});

app.post('/api/pool/keys', auth.adminMiddleware, async (req, res) => {
  const email = String(req.body?.email || '').trim();
  const apiKey = String(req.body?.api_key || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'api_key is required' });
  try {
    let balance = 0;
    let healthStatus = 'healthy';
    let healthMessage = null;
    try {
      const out = await poolModule.runCLI(['account', 'status', '--json'], { RENOISE_API_KEY: apiKey });
      const data = JSON.parse(out);
      balance = data.credit?.balance ?? 0;
      healthStatus = balance <= 0 ? 'exhausted' : 'healthy';
    } catch (e) {
      healthStatus = /unauthorized|invalid.*key|authentication|401|403/i.test(e.message) ? 'auth' : 'degraded';
      healthMessage = String(e.message).slice(0, 500);
    }
    const key = await poolModule.addKey(email, apiKey, balance);
    // Auto health check immediately after adding
    await poolModule.checkKey(key.id);
    await audit.record(req, 'key.add', 'api_key', key.id, { email, healthStatus });
    res.json({ ok: true, key: { email: key.email, key: key.key.substring(0, 8) + '...', balance: key.balance, healthStatus } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pool/clear', auth.adminMiddleware, async (req, res) => {
  await poolModule.clearPool();
  await audit.record(req, 'key.clear', 'api_key');
  res.json({ ok: true });
});

app.post('/api/pool/refresh-credits', auth.adminMiddleware, async (req, res) => {
  try {
    const pool = await poolModule.refreshCredits();
    await audit.record(req, 'key.refresh', 'api_key', null, { count: pool.length });
    res.json({ ok: true, pool });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk health check all keys
app.post('/api/pool/health-check-all', auth.adminMiddleware, async (req, res) => {
  try {
    const keys = await poolModule.listKeys();
    let checked = 0, healthy = 0, unhealthy = 0;
    for (const key of keys) {
      if (!key.id) continue;
      const result = await poolModule.checkKey(key.id);
      checked++;
      if (result.healthStatus === 'healthy') healthy++;
      else unhealthy++;
    }
    await audit.record(req, 'key.bulk_check', 'api_key', null, { checked, healthy, unhealthy });
    res.json({ ok: true, checked, healthy, unhealthy });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auto-remove unhealthy keys
app.post('/api/pool/remove-unhealthy', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const result = await query("DELETE FROM api_keys WHERE health_status IN ('auth', 'degraded') AND last_checked_at < now() - interval '7 days' RETURNING id, email, health_status");
    await audit.record(req, 'key.remove_unhealthy', 'api_key', null, { removed: result.rows.length });
    res.json({ ok: true, removed: result.rows.length, keys: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== ADDITIONAL KEY MANAGEMENT ENDPOINTS ==========

// Get keys with pagination, filter, search
app.get('/api/admin/keys/health', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const { search, health, sort, page = 1, limit = 50 } = req.query;
    
    const params = [];
    const where = [];
    
    if (search) {
      params.push(`%${String(search).toLowerCase()}%`);
      where.push(`(LOWER(email) LIKE $${params.length} OR CAST(id AS TEXT) LIKE $${params.length})`);
    }
    
    if (health && health !== 'all') {
      params.push(health);
      where.push(`health_status = $${params.length}`);
    }
    
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    
    let orderBy = 'created_at DESC';
    if (sort === 'balance_desc') orderBy = 'balance DESC, created_at DESC';
    else if (sort === 'balance_asc') orderBy = 'balance ASC, created_at DESC';
    else if (sort === 'health') orderBy = "CASE health_status WHEN 'healthy' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END, created_at DESC";
    else if (sort === 'usage') orderBy = 'usage_count DESC, created_at DESC';
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);
    
    const countResult = await query(`SELECT COUNT(*)::int as total FROM api_keys ${whereClause}`, params.slice(0, -2));
    const keys = await query(`
      SELECT id, email, balance, exhausted, exhausted_at, health_status, health_message, 
             last_checked_at, consecutive_failures, usage_count, last_used_at, 
             success_count, error_count, notes, tags, created_at, updated_at
      FROM api_keys ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    
    res.json({
      keys: keys.rows,
      total: countResult.rows[0].total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get key statistics
app.get('/api/admin/keys/stats', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const stats = await query(`
      SELECT 
        COUNT(*)::int as total_keys,
        COUNT(*) FILTER (WHERE health_status = 'healthy')::int as healthy_keys,
        COUNT(*) FILTER (WHERE health_status != 'healthy')::int as unhealthy_keys,
        COUNT(*) FILTER (WHERE health_status = 'unknown')::int as unchecked_keys,
        COUNT(*) FILTER (WHERE exhausted)::int as exhausted_keys,
        COALESCE(SUM(balance), 0)::int as total_balance,
        COALESCE(AVG(balance), 0)::numeric(10,2) as avg_balance,
        COALESCE(SUM(usage_count), 0)::int as total_usage,
        COALESCE(SUM(success_count), 0)::int as total_success,
        COALESCE(SUM(error_count), 0)::int as total_errors,
        MIN(last_checked_at) as oldest_check
      FROM api_keys
    `);
    res.json(stats.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update individual key
app.patch('/api/admin/keys/:id', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const id = parseInt(req.params.id);
    const { email, balance, exhausted, notes, tags } = req.body;
    
    const updates = [];
    const params = [];
    
    if (email !== undefined) {
      params.push(email);
      updates.push(`email = $${params.length}`);
    }
    if (balance !== undefined) {
      params.push(parseInt(balance));
      updates.push(`balance = $${params.length}`);
    }
    if (exhausted !== undefined) {
      params.push(exhausted);
      updates.push(`exhausted = $${params.length}`);
      if (exhausted) {
        updates.push(`exhausted_at = now()`);
      }
    }
    if (notes !== undefined) {
      params.push(notes);
      updates.push(`notes = $${params.length}`);
    }
    if (tags !== undefined) {
      params.push(tags);
      updates.push(`tags = $${params.length}`);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = now()');
    params.push(id);
    
    const result = await query(`
      UPDATE api_keys 
      SET ${updates.join(', ')}
      WHERE id = $${params.length}
      RETURNING *
    `, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Key not found' });
    }
    
    await audit.record(req, 'key.update', 'api_key', id, { updates: Object.keys(req.body) });
    res.json({ ok: true, key: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete individual key
app.delete('/api/admin/keys/:id', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const id = parseInt(req.params.id);
    const result = await query('DELETE FROM api_keys WHERE id = $1 RETURNING email', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Key not found' });
    }
    
    await audit.record(req, 'key.delete', 'api_key', id, { email: result.rows[0].email });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk delete keys
app.post('/api/admin/keys/bulk-delete', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    
    const result = await query('DELETE FROM api_keys WHERE id = ANY($1::bigint[]) RETURNING id, email', [ids]);
    await audit.record(req, 'key.bulk_delete', 'api_key', null, { count: result.rows.length, ids });
    res.json({ ok: true, deleted: result.rows.length, keys: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Export keys to CSV
app.get('/api/admin/keys/export', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const keys = await query('SELECT * FROM api_keys ORDER BY created_at DESC');
    
    const csv = [
      'id,email,balance,exhausted,health_status,usage_count,success_count,error_count,notes,tags,created_at',
      ...keys.rows.map(k => [
        k.id,
        k.email,
        k.balance,
        k.exhausted,
        k.health_status,
        k.usage_count,
        k.success_count,
        k.error_count,
        `"${(k.notes || '').replace(/"/g, '""')}"`,
        `"${(k.tags || []).join(',')}"`,
        k.created_at
      ].join(','))
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="api-keys-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Import keys from CSV
app.post('/api/admin/keys/import', auth.adminMiddleware, async (req, res) => {
  try {
    const { keys } = req.body; // Array of {email, api_key, notes?, tags?}
    
    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({ error: 'keys array is required' });
    }
    
    const results = { success: 0, failed: 0, errors: [] };
    
    for (const keyData of keys) {
      try {
        const email = String(keyData.email || '').trim();
        const apiKey = String(keyData.api_key || '').trim();
        
        if (!apiKey) {
          results.failed++;
          results.errors.push({ email, error: 'Missing api_key' });
          continue;
        }
        
        let balance = 0;
        let healthStatus = 'healthy';
        try {
          const out = await poolModule.runCLI(['account', 'status', '--json'], { RENOISE_API_KEY: apiKey });
          const data = JSON.parse(out);
          balance = data.credit?.balance ?? 0;
        } catch (e) {
          healthStatus = 'unknown';
        }
        
        const key = await poolModule.addKey(email, apiKey, balance);
        
        if (keyData.notes || keyData.tags) {
          const { query } = require('./src/db');
          await query(
            'UPDATE api_keys SET notes = $1, tags = $2 WHERE id = $3',
            [keyData.notes || null, keyData.tags || [], key.id]
          );
        }
        
        results.success++;
      } catch (e) {
        results.failed++;
        results.errors.push({ email: keyData.email, error: e.message });
      }
    }
    
    await audit.record(req, 'key.bulk_import', 'api_key', null, results);
    res.json({ ok: true, ...results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Check individual key health
app.post('/api/admin/keys/:id/check', auth.adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await poolModule.checkKey(id);
    await audit.record(req, 'key.check', 'api_key', id, { healthStatus: result.healthStatus });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ========== GENERATION & RESULTS ROUTES ==========

app.get('/api/results', auth.anyAuthMiddleware, async (req, res) => {
  const wantsPage = req.query.page !== undefined || req.query.limit !== undefined || req.query.q !== undefined || req.query.model !== undefined || req.query.ratio !== undefined || req.query.from !== undefined || req.query.to !== undefined;
  if (wantsPage) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1), limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 24));
    const params = [], where = [];
    if (req.user.role !== 'admin') { params.push(req.user.email); where.push(`email=$${params.length}`); where.push('deleted_at IS NULL'); }
    for (const [name, expression] of [['q', "COALESCE(result->>'originalPrompt',result->>'prompt','') ILIKE"], ['model', "result->>'model' ="], ['ratio', "result->>'ratio' ="]]) if (req.query[name]) { params.push(name === 'q' ? `%${String(req.query[name]).slice(0, 200)}%` : String(req.query[name]).slice(0, 100)); where.push(`${expression} $${params.length}`); }
    if (req.query.from) { params.push(req.query.from); where.push(`created_at >= $${params.length}::timestamptz`); }
    if (req.query.to) { params.push(req.query.to); where.push(`created_at <= $${params.length}::timestamptz`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await db.query(`SELECT count(*)::int AS total FROM image_results ${clause}`, params);
    params.push(limit, (page - 1) * limit);
    const rows = await db.query(`SELECT task_id,batch_id,batch_position,email,result,created_at,is_favorite FROM image_results ${clause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return res.json({ items: rows.rows.map(row => ({ 
      taskId: row.task_id, 
      batchId: row.batch_id || row.result.batchId,
      batchPosition: row.batch_position ?? row.result.batchPosition,
      url: `/api/media/result/${encodeURIComponent(row.task_id)}`, 
      thumbnailUrl: `/api/media/thumbnail/${encodeURIComponent(row.task_id)}`,
      prompt: row.result.originalPrompt || row.result.prompt, 
      model: row.result.model, 
      ratio: row.result.ratio, 
      resolution: row.result.resolution, 
      estimatedCredit: row.result.estimatedCredit, 
      timestamp: row.result.timestamp || row.created_at, 
      user: row.email, 
      isPublic: Boolean(row.result.isPublic), 
      isFavorite: Boolean(row.is_favorite),
      refUrls: row.result.refUrls || [],
      negativePrompt: row.result.negativePrompt || '',
    })), total: count.rows[0].total, page, limit });
  }
  const results = await generation.listResults();
  const filtered = req.user.role === 'admin' ? results : results.filter(r => r.user === (req.user.email || ''));
  const safe = filtered.map(r => ({
    url: `/api/media/result/${encodeURIComponent(String(r.taskId))}`,
    thumbnailUrl: `/api/media/thumbnail/${encodeURIComponent(String(r.taskId))}`,
    prompt: r.originalPrompt || r.prompt,
    model: r.model,
    ratio: r.ratio,
    resolution: r.resolution,
    taskId: r.taskId,
    batchId: r.batchId,
    batchPosition: r.batchPosition,
    estimatedCredit: r.estimatedCredit,
    timestamp: r.timestamp,
    user: r.user || '',
    isPublic: Boolean(r.isPublic),
    isFavorite: Boolean(r.isFavorite),
    refUrls: r.refUrls || [],
  }));
  res.json(safe);
});

app.get('/api/media/result/:taskId', async (req, res) => {
  const taskId = String(req.params.taskId);
  const { rows } = await db.query('SELECT email,result,deleted_at FROM image_results WHERE task_id=$1', [taskId]);
  if (!rows[0]) return res.status(404).end();
  
  // Check both user and admin tokens
  const userToken = req.cookies?.token;
  const adminToken = req.cookies?.admintoken;
  const headerToken = req.headers.authorization?.replace('Bearer ', '');
  const token = headerToken || userToken || adminToken;
  const user = await auth.resolveTokenUser(token);
  if (rows[0].deleted_at && user?.role !== 'admin') return res.status(404).end();
  
  const isPublic = rows[0].result?.isPublic === true;
  if (!isPublic && (!user || (user.role !== 'admin' && user.email !== rows[0].email))) return res.status(404).end();
  const storagePath = rows[0].result?.storagePath;
  if (storagePath && fs.existsSync(storagePath)) {
    res.set('Cache-Control', isPublic ? 'public, max-age=86400, stale-while-revalidate=604800' : 'private, no-store');
    return res.sendFile(path.resolve(storagePath));
  }
  const legacyUrl = String(rows[0].result?.localUrl || '');
  const legacyPath = legacyUrl.startsWith('/images/') ? path.join(publicDir, legacyUrl.slice(1)) : '';
  if (!legacyPath || !fs.existsSync(legacyPath)) return res.status(404).end();
  res.set('Cache-Control', isPublic ? 'public, max-age=86400, stale-while-revalidate=604800' : 'private, no-store');
  res.sendFile(path.resolve(legacyPath));
});

// Thumbnail endpoint - optimized for gallery loading
app.get('/api/media/thumbnail/:taskId', async (req, res) => {
  const taskId = String(req.params.taskId);
  const { rows } = await db.query('SELECT email,result,deleted_at FROM image_results WHERE task_id=$1', [taskId]);
  if (!rows[0]) return res.status(404).end();
  
  // Check both user and admin tokens
  const userToken = req.cookies?.token;
  const adminToken = req.cookies?.admintoken;
  const headerToken = req.headers.authorization?.replace('Bearer ', '');
  const token = headerToken || userToken || adminToken;
  const user = await auth.resolveTokenUser(token);
  if (rows[0].deleted_at && user?.role !== 'admin') return res.status(404).end();
  
  const isPublic = rows[0].result?.isPublic === true;
  
  // Allow access if public OR user is owner OR user is admin
  if (!isPublic && (!user || (user.role !== 'admin' && user.email !== rows[0].email))) return res.status(404).end();
  
  // Try thumbnail first
  const thumbnailPath = rows[0].result?.thumbnailPath;
  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    res.set('Cache-Control', isPublic ? 'public, max-age=2592000, immutable' : 'private, max-age=86400');
    res.set('Content-Type', 'image/webp');
    return res.sendFile(path.resolve(thumbnailPath));
  }
  
  // Fallback to original image
  const storagePath = rows[0].result?.storagePath;
  if (storagePath && fs.existsSync(storagePath)) {
    res.set('Cache-Control', isPublic ? 'public, max-age=86400' : 'private, max-age=86400');
    return res.sendFile(path.resolve(storagePath));
  }
  
  res.status(404).end();
});

// Reference thumbnail endpoint
app.get('/api/media/reference-thumbnail/:id', auth.anyAuthMiddleware, async (req, res) => {
  const { rows } = await db.query('SELECT owner_email, storage_path, thumbnail_path, mime_type, deleted_at FROM image_references WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).end();
  if (rows[0].deleted_at && req.user.role !== 'admin') return res.status(404).end();
  if (req.user.role !== 'admin' && req.user.email !== rows[0].owner_email) return res.status(404).end();
  
  // Try thumbnail first
  const thumbnailPath = rows[0].thumbnail_path;
  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    res.set('Cache-Control', 'public, max-age=2592000, immutable');
    res.set('Content-Type', 'image/webp');
    return res.sendFile(path.resolve(thumbnailPath));
  }
  
  // Fallback to original
  if (!fs.existsSync(rows[0].storage_path)) return res.status(404).end();
  res.type(rows[0].mime_type).set('Cache-Control', 'public, max-age=86400').sendFile(path.resolve(rows[0].storage_path));
});

app.get('/api/media/reference/:id', auth.anyAuthMiddleware, async (req, res) => {
  const { rows } = await db.query('SELECT owner_email, storage_path, mime_type, deleted_at FROM image_references WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).end();
  if (rows[0].deleted_at && req.user.role !== 'admin') return res.status(404).end();
  if (req.user.role !== 'admin' && req.user.email !== rows[0].owner_email) return res.status(404).end();
  if (!fs.existsSync(rows[0].storage_path)) return res.status(404).end();
  res.type(rows[0].mime_type).set('Cache-Control', 'private, max-age=86400').sendFile(path.resolve(rows[0].storage_path));
});

app.get('/api/references', auth.authMiddleware, async (req, res) => {
  const search = String(req.query.q || '').trim().slice(0, 120);
  const sort = String(req.query.sort || 'newest');
  const orderBy = {
    newest: '"createdAt" DESC, id DESC',
    oldest: '"createdAt" ASC, id ASC',
    used: '"lastUsedAt" DESC NULLS LAST, "createdAt" DESC, id DESC',
    favorites: '"isFavorite" DESC, "createdAt" DESC, id DESC',
    name: 'LOWER("name") ASC, id DESC',
  }[sort] || '"createdAt" DESC, id DESC';
  const params = [req.user.email];
  let searchClause = '';
  if (search) {
    params.push(`%${search}%`);
    searchClause = ` AND COALESCE(NULLIF(display_name,''), original_name) ILIKE $${params.length}`;
  }
  const { rows } = await db.query(
    `SELECT id, name, "originalName", "mimeType", "byteSize", "isFavorite", "lastUsedAt", "usageCount", "createdAt"
     FROM (
       SELECT DISTINCT ON (COALESCE(content_hash, id::text))
              id, COALESCE(NULLIF(display_name,''), original_name) AS "name", original_name AS "originalName",
              mime_type AS "mimeType", byte_size AS "byteSize", is_favorite AS "isFavorite",
              last_used_at AS "lastUsedAt", usage_count AS "usageCount", created_at AS "createdAt"
       FROM image_references WHERE owner_email=$1 AND deleted_at IS NULL${searchClause}
       ORDER BY COALESCE(content_hash, id::text), created_at DESC
     ) deduped
     ORDER BY ${orderBy} LIMIT 200`,
    params
  );
  res.json({ items: rows.map(row => ({ ...row, id: String(row.id), url: `/api/media/reference/${row.id}`, thumbnailUrl: `/api/media/reference-thumbnail/${row.id}` })) });
});

app.patch('/api/references/:id', auth.authMiddleware, async (req, res) => {
  const updates = [], params = [];
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
    const name = String(req.body.name || '').trim().slice(0, 120);
    if (name.length < 1) return res.status(400).json({ error: 'Reference name is required' });
    params.push(name);
    updates.push(`display_name=$${params.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'isFavorite')) {
    params.push(Boolean(req.body.isFavorite));
    updates.push(`is_favorite=$${params.length}`);
  }
  if (!updates.length) return res.status(400).json({ error: 'No reference changes supplied' });
  params.push(req.params.id, req.user.email);
  const { rows } = await db.query(
    `UPDATE image_references SET ${updates.join(', ')}
     WHERE id=$${params.length - 1} AND owner_email=$${params.length} AND deleted_at IS NULL
     RETURNING id,COALESCE(NULLIF(display_name,''),original_name) AS name,is_favorite AS "isFavorite"`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Reference not found' });
  res.json({ ok: true, item: { ...rows[0], id: String(rows[0].id) } });
});

app.post('/api/references/use', auth.authMiddleware, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.map(id => String(id)))].slice(0, 10) : [];
  if (!ids.length || ids.some(id => !/^\d+$/.test(id))) return res.status(400).json({ error: 'Valid reference ids are required' });
  const { rows } = await db.query(
    `UPDATE image_references SET last_used_at=now(),usage_count=usage_count+1
     WHERE id=ANY($1::bigint[]) AND owner_email=$2 AND deleted_at IS NULL RETURNING id`,
    [ids, req.user.email]
  );
  res.json({ ok: true, updated: rows.length });
});

app.delete('/api/references/:id', auth.authMiddleware, async (req, res) => {
  const result = await db.query(
    `UPDATE image_references SET deleted_at=COALESCE(deleted_at, now()), deleted_by='user'
     WHERE id=$1 AND owner_email=$2 AND deleted_at IS NULL RETURNING id`,
    [req.params.id, req.user.email]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Reference not found' });
  res.json({ ok: true, archived: true });
});

app.get('/api/admin/references', auth.adminMiddleware, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  const filters = [], params = [];
  let pi = 0;

  if (req.query.q) { pi++; params.push(`%${String(req.query.q).slice(0, 200)}%`); filters.push(`(r.owner_email ILIKE $${pi} OR r.original_name ILIKE $${pi} OR COALESCE(r.display_name,'') ILIKE $${pi})`); }
  if (req.query.email) { pi++; params.push(String(req.query.email).toLowerCase().slice(0, 200)); filters.push(`LOWER(r.owner_email)=$${pi}`); }
  if (req.query.deleted === 'only') filters.push('r.deleted_at IS NOT NULL');
  else if (req.query.deleted === 'all') {} // include both
  else filters.push('r.deleted_at IS NULL');

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
  const [items, count] = await Promise.all([
    db.query(`SELECT r.id, r.owner_email AS "ownerEmail", COALESCE(r.display_name, r.original_name) AS "name", r.original_name AS "originalName", r.mime_type AS "mimeType", r.byte_size AS "byteSize", r.usage_count AS "usageCount", r.last_used_at AS "lastUsedAt", r.created_at AS "createdAt", r.deleted_at AS "deletedAt", r.deleted_by AS "deletedBy", r.batch_id AS "batchId", r.is_favorite AS "isFavorite" FROM image_references r ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT $${pi + 1} OFFSET $${pi + 2}`, [...params, limit, offset]),
    db.query(`SELECT count(*)::int AS total FROM image_references r ${where}`, params),
  ]);
  res.json({
    items: items.rows.map(row => ({ ...row, id: String(row.id), url: `/api/media/reference/${row.id}`, thumbnailUrl: `/api/media/reference-thumbnail/${row.id}` })),
    total: count.rows[0].total,
    page, limit,
  });
});

app.get('/api/admin/references/stats', auth.adminMiddleware, async (req, res) => {
  const [total, active, deleted, orphan, size] = await Promise.all([
    db.query("SELECT count(*)::int AS total FROM image_references"),
    db.query("SELECT count(*)::int AS total FROM image_references WHERE deleted_at IS NULL"),
    db.query("SELECT count(*)::int AS total FROM image_references WHERE deleted_at IS NOT NULL"),
    db.query("SELECT count(*)::int AS total FROM image_references r WHERE r.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = r.owner_email)"),
    db.query("SELECT COALESCE(sum(byte_size),0)::bigint AS total FROM image_references WHERE deleted_at IS NULL"),
  ]);
  res.json({
    total: total.rows[0].total,
    active: active.rows[0].total,
    deleted: deleted.rows[0].total,
    orphan: orphan.rows[0].total,
    totalBytes: size.rows[0].total,
  });
});

app.post('/api/admin/references/bulk-delete', auth.adminMiddleware, async (req, res) => {
  const { ids, permanent } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
  if (permanent) {
    const { rows: refs } = await db.query('SELECT id, storage_path, thumbnail_path FROM image_references WHERE id = ANY($1::bigint[])', [ids]);
    for (const ref of refs) {
      try { fs.unlinkSync(ref.storage_path); } catch (_) {}
      if (ref.thumbnail_path) try { fs.unlinkSync(ref.thumbnail_path); } catch (_) {}
    }
    await db.query('DELETE FROM image_references WHERE id = ANY($1::bigint[])', [ids]);
  } else {
    await db.query("UPDATE image_references SET deleted_at = now(), deleted_by = 'admin' WHERE id = ANY($1::bigint[]) AND deleted_at IS NULL", [ids]);
  }
  await audit.record(req, 'reference.bulk_delete', 'reference', null, { count: ids.length, permanent });
  res.json({ ok: true, count: ids.length });
});

app.post('/api/admin/references/cleanup', auth.adminMiddleware, async (req, res) => {
  const { type } = req.body;
  let deleted = 0;
  if (type === 'orphan') {
    const { rows } = await db.query("SELECT r.id, r.storage_path, r.thumbnail_path FROM image_references r WHERE r.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = r.owner_email)");
    for (const ref of rows) {
      try { fs.unlinkSync(ref.storage_path); } catch (_) {}
      if (ref.thumbnail_path) try { fs.unlinkSync(ref.thumbnail_path); } catch (_) {}
    }
    if (rows.length) await db.query("DELETE FROM image_references WHERE id = ANY($1::bigint[])", [rows.map(r => r.id)]);
    deleted = rows.length;
  } else if (type === 'unused') {
    const days = parseInt(req.body.days, 10) || 30;
    const { rows } = await db.query(`SELECT r.id, r.storage_path, r.thumbnail_path FROM image_references r WHERE r.deleted_at IS NULL AND r.usage_count = 0 AND r.created_at < now() - interval '${days} days'`);
    for (const ref of rows) {
      try { fs.unlinkSync(ref.storage_path); } catch (_) {}
      if (ref.thumbnail_path) try { fs.unlinkSync(ref.thumbnail_path); } catch (_) {}
    }
    if (rows.length) await db.query("DELETE FROM image_references WHERE id = ANY($1::bigint[])", [rows.map(r => r.id)]);
    deleted = rows.length;
  } else {
    return res.status(400).json({ error: 'type must be orphan or unused' });
  }
  await audit.record(req, 'reference.cleanup', 'reference', null, { type, deleted });
  res.json({ ok: true, deleted });
});

app.get('/api/admin/gallery', auth.adminMiddleware, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 24));
  const offset = (page - 1) * limit;
  const filters = [], filterParams = [];
  
  // Search filters
  if (req.query.q) { 
    filterParams.push(`%${String(req.query.q).slice(0, 200)}%`); 
    filters.push(`(r.email ILIKE $${filterParams.length} OR COALESCE(r.result->>'originalPrompt',r.result->>'prompt','') ILIKE $${filterParams.length})`); 
  }
  if (req.query.email) { 
    filterParams.push(String(req.query.email).toLowerCase().slice(0, 200)); 
    filters.push(`LOWER(r.email)=$${filterParams.length}`); 
  }
  if (req.query.model) { 
    filterParams.push(String(req.query.model).slice(0, 100)); 
    filters.push(`r.result->>'model'=$${filterParams.length}`); 
  }
  if (req.query.ratio) { 
    filterParams.push(String(req.query.ratio).slice(0, 50)); 
    filters.push(`r.result->>'ratio'=$${filterParams.length}`); 
  }
  if (req.query.visibility === 'public') filters.push("r.result->>'isPublic'='true'");
  if (req.query.visibility === 'private') filters.push("COALESCE(r.result->>'isPublic','false')!='true'");
  if (req.query.visibility === 'reported') filters.push("EXISTS(SELECT 1 FROM public_post_reports report WHERE report.task_id=r.task_id AND report.status='open')");
  if (req.query.deletion === 'active') filters.push('r.deleted_at IS NULL');
  if (req.query.deletion === 'deleted') filters.push('r.deleted_at IS NOT NULL');
  
  // Date filters
  if (req.query.dateFrom) {
    filterParams.push(req.query.dateFrom);
    filters.push(`r.created_at >= $${filterParams.length}::timestamptz`);
  }
  if (req.query.dateTo) {
    filterParams.push(req.query.dateTo);
    filters.push(`r.created_at <= $${filterParams.length}::timestamptz`);
  }
  
  const galleryWhere = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  
  // Sort options
  let orderBy = 'r.created_at DESC';
  if (req.query.sort === 'oldest') orderBy = 'r.created_at ASC';
  if (req.query.sort === 'cost-high') orderBy = `(r.result->>'estimatedCredit')::int DESC NULLS LAST, r.created_at DESC`;
  if (req.query.sort === 'cost-low') orderBy = `(r.result->>'estimatedCredit')::int ASC NULLS LAST, r.created_at DESC`;
  if (req.query.sort === 'user') orderBy = 'r.email ASC, r.created_at DESC';
  
  const [resultRows, countRows] = await Promise.all([
    db.query(
      `SELECT r.task_id, r.batch_id, r.email, r.result, r.created_at,r.deleted_at,r.deleted_by,r.owner_deleted_at,
        (SELECT count(*)::int FROM public_post_reports report WHERE report.task_id=r.task_id AND report.status='open') AS report_count,
        COALESCE(json_agg(json_build_object('id', ref.id, 'position', ref.position, 'originalName', ref.original_name, 'mimeType', ref.mime_type, 'byteSize', ref.byte_size, 'thumbnailPath', ref.thumbnail_path, 'deletedAt', ref.deleted_at, 'deletedBy', ref.deleted_by) ORDER BY ref.position) FILTER (WHERE ref.id IS NOT NULL), '[]') AS references
       FROM image_results r LEFT JOIN image_references ref ON (ref.task_id=r.task_id OR (r.batch_id IS NOT NULL AND ref.batch_id=r.batch_id)) ${galleryWhere}
       GROUP BY r.task_id, r.email, r.result, r.created_at ORDER BY ${orderBy} LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}`,
      [...filterParams, limit, offset]
    ),
    db.query(`SELECT count(*)::int AS total FROM image_results r ${galleryWhere}`, filterParams)
  ]);
  const items = resultRows.rows.map(row => ({
    taskId: row.task_id,
    batchId: row.batch_id,
    ownerEmail: row.email,
    url: `/api/media/result/${encodeURIComponent(row.task_id)}`,
    thumbnailUrl: `/api/media/thumbnail/${encodeURIComponent(row.task_id)}`,
    prompt: row.result.originalPrompt || row.result.prompt || '',
    model: row.result.model || '',
    ratio: row.result.ratio || '',
    resolution: row.result.resolution || '',
    cost: row.result.estimatedCredit || 0,
    isPublic: Boolean(row.result.isPublic),
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    ownerDeletedAt: row.owner_deleted_at,
    timestamp: row.result.timestamp || row.created_at,
    width: row.result.width,
    height: row.result.height,
    fileSize: row.result.fileSize,
    format: row.result.format,
    reportCount: row.report_count || 0,
    references: row.references.map(ref => ({
      ...ref,
      name: ref.originalName,
      mime: ref.mimeType,
      bytes: Number(ref.byteSize || 0),
      url: `/api/media/reference/${ref.id}`,
      thumbnailUrl: ref.thumbnailPath ? `/api/media/reference-thumbnail/${ref.id}` : `/api/media/reference/${ref.id}`,
      deletedAt: ref.deletedAt,
      deletedBy: ref.deletedBy,
    })),
  }));
  res.json({ items, total: countRows.rows[0].total, page, limit });
});

// Bulk actions for admin gallery
app.post('/api/admin/gallery/bulk', auth.adminMiddleware, async (req, res) => {
  const { taskIds, action } = req.body;
  
  if (!Array.isArray(taskIds) || taskIds.length === 0 || taskIds.length > 100) {
    return res.status(400).json({ error: 'Invalid taskIds (max 100)' });
  }
  
  try {
    if (action === 'delete') {
      // Get images to delete
      const { rows } = await db.query(
        'SELECT task_id, batch_id, result FROM image_results WHERE task_id = ANY($1)',
        [taskIds]
      );
      
      // Delete files from storage
      for (const row of rows) {
        const storagePath = row.result?.storagePath;
        const thumbnailPath = row.result?.thumbnailPath;
        
        if (storagePath && fs.existsSync(storagePath)) {
          try { fs.unlinkSync(storagePath); } catch (e) { console.error('Failed to delete', e.message); }
        }
        if (thumbnailPath && fs.existsSync(thumbnailPath)) {
          try { fs.unlinkSync(thumbnailPath); } catch (e) { console.error('Failed to delete thumbnail', e.message); }
        }
      }
      
      // Delete references
      const batchIds = [...new Set(rows.map(row => row.batch_id).filter(Boolean))];
      const refRows = await db.query(
        `SELECT id,storage_path,thumbnail_path FROM image_references ref
         WHERE (ref.batch_id IS NULL AND ref.task_id=ANY($1::text[]))
            OR (ref.batch_id=ANY($2::text[]) AND NOT EXISTS (
              SELECT 1 FROM image_results sibling
              WHERE sibling.batch_id=ref.batch_id AND NOT (sibling.task_id=ANY($1::text[]))
            ))`,
        [taskIds, batchIds]
      );
      for (const ref of refRows.rows) {
        if (ref.storage_path && fs.existsSync(ref.storage_path)) {
          try { fs.unlinkSync(ref.storage_path); } catch (e) {}
        }
        if (ref.thumbnail_path && fs.existsSync(ref.thumbnail_path)) {
          try { fs.unlinkSync(ref.thumbnail_path); } catch (e) {}
        }
      }
      
      // Delete from database
      if (refRows.rows.length > 0) await db.query('DELETE FROM image_references WHERE id=ANY($1::bigint[])', [refRows.rows.map(ref => ref.id)]);
      await db.query('DELETE FROM image_results WHERE task_id = ANY($1)', [taskIds]);
      await audit.record(req, 'gallery.bulk_delete', null, null, { count: taskIds.length });
      
      return res.json({ ok: true, deleted: taskIds.length });
    }
    
    if (action === 'setPublic' || action === 'setPrivate') {
      const isPublic = action === 'setPublic';
      await db.query(
        `UPDATE image_results SET result = jsonb_set(result, '{isPublic}', $2::jsonb) WHERE task_id = ANY($1) AND deleted_at IS NULL`,
        [taskIds, JSON.stringify(isPublic)]
      );
      if (isPublic) {
        await db.query(`INSERT INTO public_posts(task_id,owner_email,published_at)
          SELECT task_id,email,now() FROM image_results WHERE task_id=ANY($1::text[]) AND deleted_at IS NULL
          ON CONFLICT(task_id) DO UPDATE SET updated_at=now()`, [taskIds]);
      } else {
        await db.query('DELETE FROM public_posts WHERE task_id=ANY($1::text[])', [taskIds]);
      }
      await audit.record(req, 'gallery.bulk_visibility', null, null, { count: taskIds.length, isPublic });
      
      return res.json({ ok: true, updated: taskIds.length });
    }
    
    res.status(400).json({ error: 'Invalid action' });
  } catch (e) {
    console.error('Bulk action failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Export gallery to CSV
app.get('/api/admin/gallery/export', auth.adminMiddleware, async (req, res) => {
  try {
    const filters = [], filterParams = [];
    
    // Apply same filters as gallery
    if (req.query.q) { 
      filterParams.push(`%${String(req.query.q).slice(0, 200)}%`); 
      filters.push(`(r.email ILIKE $${filterParams.length} OR COALESCE(r.result->>'originalPrompt',r.result->>'prompt','') ILIKE $${filterParams.length})`); 
    }
    if (req.query.email) { 
      filterParams.push(String(req.query.email).toLowerCase().slice(0, 200)); 
      filters.push(`LOWER(r.email)=$${filterParams.length}`); 
    }
    if (req.query.model) { 
      filterParams.push(String(req.query.model).slice(0, 100)); 
      filters.push(`r.result->>'model'=$${filterParams.length}`); 
    }
    if (req.query.visibility === 'public') filters.push("r.result->>'isPublic'='true'");
    if (req.query.visibility === 'private') filters.push("COALESCE(r.result->>'isPublic','false')!='true'");
    if (req.query.deletion === 'active') filters.push('r.deleted_at IS NULL');
    if (req.query.deletion === 'deleted') filters.push('r.deleted_at IS NOT NULL');
    
    const galleryWhere = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    
    const { rows } = await db.query(`
      SELECT 
        r.task_id, 
        r.email, 
        COALESCE(r.result->>'originalPrompt', r.result->>'prompt') as prompt,
        r.result->>'model' as model,
        r.result->>'ratio' as ratio,
        r.result->>'resolution' as resolution,
        (r.result->>'estimatedCredit')::int as cost,
        CASE WHEN r.result->>'isPublic'='true' THEN 'public' ELSE 'private' END as visibility,
        r.created_at,r.deleted_at,r.deleted_by
      FROM image_results r
      ${galleryWhere}
      ORDER BY r.created_at DESC
      LIMIT 10000
    `, filterParams);
    
    // Generate CSV
    const escapeCSV = (str) => {
      if (str == null) return '';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };
    
    const csv = [
      ['Task ID', 'Email', 'Prompt', 'Model', 'Ratio', 'Resolution', 'Cost', 'Visibility', 'Deletion', 'Deleted By', 'Created At'].join(','),
      ...rows.map(row => [
        escapeCSV(row.task_id),
        escapeCSV(row.email),
        escapeCSV(row.prompt),
        escapeCSV(row.model),
        escapeCSV(row.ratio),
        escapeCSV(row.resolution),
        row.cost || 0,
        escapeCSV(row.visibility),
        escapeCSV(row.deleted_at ? 'deleted' : 'active'),
        escapeCSV(row.deleted_by),
        escapeCSV(row.created_at)
      ].join(','))
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=gallery-export-${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csv);
    
    await audit.record(req, 'gallery.export', null, null, { count: rows.length });
  } catch (e) {
    console.error('Export failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/storage', auth.adminMiddleware, async (req, res) => {
  const { query } = require('./src/db');
  fs.mkdirSync(config.STORAGE_DIR, { recursive: true });
  const stats = fs.statfsSync(config.STORAGE_DIR);
  const blockSize = Number(stats.bsize);
  const total = Number(stats.blocks) * blockSize;
  const available = Number(stats.bavail) * blockSize;
  const used = Math.max(0, total - Number(stats.bfree) * blockSize);
  let imagesWithFiles = 0;
  let totalRecords = 0;
  try {
    const [withFiles, allRecords] = await Promise.all([
      query("SELECT COUNT(*) as count FROM image_results WHERE result->>'localUrl' IS NOT NULL"),
      query("SELECT COUNT(*) as count FROM image_results")
    ]);
    imagesWithFiles = parseInt(withFiles.rows[0]?.count || '0', 10);
    totalRecords = parseInt(allRecords.rows[0]?.count || '0', 10);
  } catch (_) {}
  res.json({ total, used, available, images: imagesWithFiles, totalRecords, orphanRecords: totalRecords - imagesWithFiles });
});

app.delete('/api/results/:taskId', auth.anyAuthMiddleware, async (req, res) => {
  const { query } = require('./src/db');
  const { rows } = await query('SELECT email, batch_id, result FROM image_results WHERE task_id = $1', [req.params.taskId]);
  if (!rows[0]) return res.status(404).json({ error: 'Result not found' });
  const target = rows[0].result;
  if (req.user.role !== 'admin' && rows[0].email !== req.user.email) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (req.user.role !== 'admin') {
    await generation.archiveResult(req.params.taskId, req.user.email, 'user');
    await userActivity.logActivity(req.user.email, 'gallery.deleted', req, { taskId: req.params.taskId, retainedForAdmin: true });
    return res.json({ ok: true, archived: true });
  }
  let references;
  if (rows[0].batch_id) {
    references = await query(
      `SELECT id,storage_path,thumbnail_path FROM image_references ref
       WHERE ref.batch_id=$1 AND NOT EXISTS (
         SELECT 1 FROM image_results sibling WHERE sibling.batch_id=$1 AND sibling.task_id<>$2
       )`,
      [rows[0].batch_id, req.params.taskId]
    );
  } else {
    references = await query('SELECT id,storage_path,thumbnail_path FROM image_references WHERE task_id=$1', [req.params.taskId]);
  }
  if (references.rows.length > 0) await query('DELETE FROM image_references WHERE id=ANY($1::bigint[])', [references.rows.map(row => row.id)]);
  await generation.deleteResult(req.params.taskId);
  for (const file of [target.storagePath,target.thumbnailPath,...references.rows.flatMap(row => [row.storage_path,row.thumbnail_path])]) if (file) { try { fs.unlinkSync(file); } catch (_) {} }
  if (target.localUrl?.startsWith('/images/')) { try { fs.unlinkSync(path.join(publicDir, target.localUrl.slice(1))); } catch (_) {} }
  await audit.record(req, 'gallery.hard_delete', 'image_result', req.params.taskId);
  res.json({ ok: true, archived: false });
});

app.get('/api/models', async (req, res) => {
  const models = generation.getModels();
  try {
    const usage = await db.query(
      `SELECT model, count(*)::int AS uses
       FROM image_tasks
       WHERE status='done' AND created_at > now() - interval '30 days'
       GROUP BY model
       ORDER BY uses DESC, model ASC`
    );
    const usageByModel = Object.fromEntries(usage.rows.map(row => [row.model, row.uses]));
    const highestUsage = Math.max(0, ...Object.keys(models).map(id => Number(usageByModel[id] || 0)));
    return res.json(Object.fromEntries(Object.entries(models).map(([id, info]) => [id, {
      ...info,
      usageCount: Number(usageByModel[id] || 0),
      popular: highestUsage > 0 && Number(usageByModel[id] || 0) === highestUsage,
    }])));
  } catch (error) {
    console.error('Model popularity lookup failed:', error.message);
    return res.json(models);
  }
});

app.post('/api/analyze', auth.authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const pool = await poolModule.listKeys();
  const availKey = pool.find(k => !k.exhausted && k.key);
  if (!availKey) return res.status(500).json({ error: 'No available key' });
  try {
    const out = await poolModule.runCLI(['analyze', req.file.path, '--json', '--prompt-only'], { RENOISE_API_KEY: availKey.key });
    fs.unlinkSync(req.file.path);
    res.json({ prompt: out.trim() });
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/upload', auth.authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const pool = await poolModule.listKeys();
  const availKey = pool.find(k => !k.exhausted && k.key);
  if (!availKey) return res.status(500).json({ error: 'No available key' });
  try {
    const out = await poolModule.runCLI(['upload', req.file.path, '--json'], { RENOISE_API_KEY: availKey.key });
    const data = JSON.parse(out);
    fs.unlinkSync(req.file.path);
    res.json({ id: data.material?.id, url: data.downloadUrl, name: req.file.originalname });
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/image/generate', auth.authMiddleware, generationLimiter, upload.array('refs', 10), async (req, res) => {
  const { prompt, model, ratio, resolution, enhance } = req.body;
  const remixParentTaskId = String(req.body.remixParentTaskId || '').trim().slice(0, 200);
  const email = req.user.email;
  const uploadedFiles = req.files || [];
  const selectedModel = model || 'seedream-5-0-pro';
  if (uploadedFiles.length > 0 && !REFERENCE_IMAGE_MODELS.has(selectedModel)) {
    for (const file of uploadedFiles) { try { fs.unlinkSync(file.path); } catch (_) {} }
    return res.status(400).json({ error: 'Reference images are not available for this model. Remove the image or choose Seedream/Nano Banana.' });
  }
  const refFiles = uploadedFiles;
  const count = parseInt(req.body.count || '1', 10);
  if (!prompt || !prompt.trim()) {
    for (const file of uploadedFiles) { try { fs.unlinkSync(file.path); } catch (_) {} }
    return res.status(400).json({ error: 'Prompt required' });
  }
  if (!Number.isInteger(count) || count < 1 || count > generation.maxUserGenerations) {
    for (const file of uploadedFiles) { try { fs.unlinkSync(file.path); } catch (_) {} }
    return res.status(400).json({ error: `Count must be between 1 and ${generation.maxUserGenerations}` });
  }
  if (remixParentTaskId) {
    const source = await db.query(
      `SELECT 1 FROM public_posts p
       JOIN image_results r ON r.task_id=p.task_id
       WHERE p.task_id=$1 AND p.allow_remix=true AND p.show_prompt=true
         AND r.deleted_at IS NULL AND r.result->>'isPublic'='true'`,
      [remixParentTaskId]
    );
    if (!source.rows[0]) {
      for (const file of uploadedFiles) { try { fs.unlinkSync(file.path); } catch (_) {} }
      return res.status(400).json({ error: 'Karya sumber tidak lagi mengizinkan remix.' });
    }
  }

  const modelInfo = IMAGE_MODELS[model || 'seedream-5-0-pro'] || IMAGE_MODELS['seedream-5-0-pro'];
  if (refFiles.length > 0 && modelInfo.supportsImageInput === false) {
    for (const file of refFiles) { try { fs.unlinkSync(file.path); } catch (_) {} }
    return res.status(400).json({ error: `${modelInfo.name} does not support reference images. Choose another model or remove the reference image.` });
  }
  const cost = generation.getModelCost(model || 'seedream-5-0-pro');
  const totalCost = cost * count;

  const user = await credits.getUser(email);
  if (!user) return res.status(400).json({ error: 'User not found' });
  if (!user.unlimited && user.credits < totalCost) return res.status(400).json({ error: `Need ${totalCost} credits, you have ${user.credits}` });
  if (!user.unlimited && count + generation.activeTasksForUser(email) > generation.maxUserGenerations) return res.status(429).json({ error: `You can have at most ${generation.maxUserGenerations} queued or running images at once` });
  if (generation.getQueueLength() + count > generation.maxQueuedGenerations) return res.status(503).json({ error: 'Generation queue is full. Please try again shortly.' });

  if (config.MAX_DAILY_GENERATIONS > 0 && !user.unlimited) {
    const dailyLimit = user.freeTrial ? config.MAX_DAILY_GENERATIONS : config.MAX_PAID_DAILY_GENERATIONS;
    const today = await db.query("SELECT count(*)::int AS total FROM image_tasks WHERE email=$1 AND created_at > now()::date", [email]);
    const remaining = dailyLimit - today.rows[0].total;
    if (remaining <= 0) {
      const msg = user.freeTrial ? `Daily limit reached (${config.MAX_DAILY_GENERATIONS}/day). Upgrade to a paid plan for a higher limit.` : 'Daily limit reached. Try again tomorrow.';
      return res.status(429).json({ error: msg });
    }
    if (count > remaining) count = remaining;
  }

  const finalPrompt = (enhance === true || enhance === 'true') ? generation.enhancePrompt(prompt) : prompt;
  const taskIds = [];
  const batchId = 'batch_' + Date.now() + '_' + crypto.randomBytes(5).toString('hex');

  for (let i = 0; i < count; i++) {
    if (!user.unlimited && !await credits.deductCredits(email, cost, model || 'seedream-5-0-pro')) break;
    const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6) + '_' + i;
    // Each concurrent task needs its own temporary reference files because processing deletes them after upload.
    const taskRefs = refFiles.map((file, index) => {
      const copyPath = path.join(os.tmpdir(), `${taskId}_${index}_${path.basename(file.path)}`);
      fs.copyFileSync(file.path, copyPath);
      return { ...file, path: copyPath };
    });
    generation.pendingTasks.set(taskId, { taskId, batchId, batchPosition: i, status: 'queued', prompt: finalPrompt, model, ratio, resolution, email, cost, freeWatermarked: config.FREE_WATERMARK_ENABLED && Boolean(user.freeTrial), createdAt: new Date().toISOString() });
    await generation.saveTask(taskId, generation.pendingTasks.get(taskId));
    if (remixParentTaskId) await db.query('UPDATE image_tasks SET remix_parent_task_id=$2 WHERE task_id=$1', [taskId, remixParentTaskId]);
    if (!generation.enqueueGeneration({ taskId, batchId, prompt: finalPrompt, model: model || 'seedream-5-0-pro', ratio, resolution, refFiles: taskRefs, email })) {
      await generation.cancelTask(taskId, 'queue');
      for (const file of taskRefs) { try { fs.unlinkSync(file.path); } catch (_) {} }
      break;
    }
    taskIds.push(taskId);
  }

  for (const file of refFiles) {
    try { fs.unlinkSync(file.path); } catch (_) {}
  }

  const acceptedCost = cost * taskIds.length;
  await userActivity.logActivity(email, 'generation.create', req, { model: model || 'seedream-5-0-pro', count: taskIds.length, cost: acceptedCost, taskIds });
  db.query('INSERT INTO prompt_history(email, prompt, model, task_id) VALUES($1,$2,$3,$4)', [email, finalPrompt, model || 'seedream-5-0-pro', taskIds[0]]).catch(() => {});
  res.json({ batchId, taskIds, cost, totalCost: acceptedCost, remaining: (await credits.getUser(email))?.credits || 0 });
});

async function referenceRowsForTask(taskId) {
  return db.query(
    `SELECT id FROM image_references
     WHERE deleted_at IS NULL AND (
       task_id=$1 OR (batch_id IS NOT NULL AND batch_id=(SELECT batch_id FROM image_tasks WHERE task_id=$1))
     ) ORDER BY position`,
    [taskId]
  );
}

app.get('/api/image/task/:id', auth.anyAuthMiddleware, async (req, res) => {
  const task = generation.pendingTasks.get(req.params.id);
  if (!task) {
    // Task may have been cleaned from memory; check DB as fallback
    const { query } = require('./src/db');
    try {
      const { rows } = await query('SELECT task_id, batch_id, batch_position, email, status, result, error, cost, cancel_requested_at FROM image_tasks WHERE task_id = $1', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Task not found' });
      const row = rows[0];
      if (req.user.role !== 'admin' && row.email !== req.user.email) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const refs = await referenceRowsForTask(row.task_id);
      const refUrls = refs.rows.map(ref => `/api/media/reference/${ref.id}`);
      if (row.status === 'done' && row.result) {
        const r = row.result;
        res.json({ status: 'done', url: r.localUrl || r.url, imageUrls: r.imageUrls, taskId: r.taskId || row.task_id, batchId: row.batch_id || r.batchId, batchPosition: row.batch_position ?? r.batchPosition, prompt: r.prompt, model: r.model, ratio: r.ratio, resolution: r.resolution, estimatedCredit: r.estimatedCredit, remainingBalance: r.remainingBalance, refUrls });
      } else if (row.status === 'error') {
        res.json({ status: 'error', batchId: row.batch_id, batchPosition: row.batch_position, error: 'Generation tidak selesai. Silakan coba lagi.', recoverable: true, refUrls });
      } else if (row.status === 'cancelled') {
        res.json({ status: 'cancelled', batchId: row.batch_id, batchPosition: row.batch_position, error: 'Generation dibatalkan.', recoverable: false, refUrls });
      } else {
        res.json({ status: row.status || 'running', taskId: req.params.id, batchId: row.batch_id, batchPosition: row.batch_position, cancellationRequested: Boolean(row.cancel_requested_at) });
      }
    } catch (e) {
      console.error('Task DB fallback failed:', e.message);
      res.status(500).json({ error: 'Failed to look up task' });
    }
    return;
  }
  if (req.user.role !== 'admin' && task.email !== req.user.email && task.user !== req.user.email) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (task.status === 'done') {
    const refs = await referenceRowsForTask(task.taskId);
    const safe = { url: task.localUrl || task.url, imageUrls: task.imageUrls, taskId: task.taskId, batchId: task.batchId, batchPosition: task.batchPosition, prompt: task.prompt, model: task.model, ratio: task.ratio, resolution: task.resolution, estimatedCredit: task.estimatedCredit, remainingBalance: task.remainingBalance, refUrls: refs.rows.map(ref => `/api/media/reference/${ref.id}`) };
    res.json({ status: 'done', ...safe });
  } else if (task.status === 'error') {
    const refs = await referenceRowsForTask(task.taskId);
    res.json({ status: 'error', batchId: task.batchId, batchPosition: task.batchPosition, error: 'Generation tidak selesai. Silakan coba lagi.', recoverable: true, refUrls: refs.rows.map(ref => `/api/media/reference/${ref.id}`) });
  } else if (task.status === 'cancelled') {
    const refs = await referenceRowsForTask(task.taskId);
    res.json({ status: 'cancelled', batchId: task.batchId, batchPosition: task.batchPosition, error: 'Generation dibatalkan.', recoverable: false, refUrls: refs.rows.map(ref => `/api/media/reference/${ref.id}`) });
  } else {
    res.json({ status: task.status || 'running', taskId: req.params.id, batchId: task.batchId, batchPosition: task.batchPosition, cancellationRequested: Boolean(task.cancelRequested) });
  }
});

app.get('/api/image/tasks/active', async (req, res) => {
  // Check both user and admin tokens
  const userToken = req.cookies?.token;
  const adminToken = req.cookies?.admintoken;
  const headerToken = req.headers.authorization?.replace('Bearer ', '');
  const token = headerToken || userToken || adminToken;
  const user = await auth.resolveTokenUser(token);
  
  // Recovery is best-effort. A public/stale tab must not create a console error.
  if (!user || user.role === 'admin' || !user.email) return res.json([]);
  try {
    res.json(await generation.activeTasksForUserFromDb(user.email));
  } catch (error) {
    console.error('Active task recovery failed:', error.message);
    res.status(500).json({ error: 'Unable to load active tasks' });
  }
});

app.post('/api/image/tasks/cancel-active', auth.authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT task_id,status FROM image_tasks WHERE email=$1 AND status IN ('queued','running') ORDER BY created_at",
      [req.user.email]
    );
    const tasks = [];
    for (const row of rows) {
      const outcome = await generation.cancelTask(row.task_id, req.user.email);
      if (outcome) tasks.push({
        taskId: row.task_id,
        status: outcome.status,
        cancellationRequested: Boolean(outcome.cancellationRequested),
        providerCancellation: outcome.providerCancellation || null,
      });
    }
    const cancelled = tasks.filter(task => task.status === 'cancelled').length;
    const cancellationRequested = tasks.filter(task => task.cancellationRequested).length;
    await userActivity.logActivity(req.user.email, 'generation.cancel_active', req, { requested: rows.length, cancelled, cancellationRequested });
    res.json({ ok: true, requested: rows.length, cancelled, cancellationRequested, tasks });
  } catch (error) {
    console.error('User active generation cancellation failed:', error.message);
    res.status(500).json({ error: 'Generation aktif tidak dapat dibatalkan.' });
  }
});

app.get('/api/image/tasks/interrupted', auth.authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT count(*)::int AS count, COALESCE(sum(cost), 0)::int AS "refundedCredits", max(finished_at) AS "lastInterruptedAt"
       FROM image_tasks
       WHERE email=$1 AND status='error' AND error='Generation interrupted by server restart'
         AND finished_at > now() - interval '2 hours'`,
      [req.user.email]
    );
    res.json(rows[0] || { count: 0, refundedCredits: 0, lastInterruptedAt: null });
  } catch (error) {
    console.error('Interrupted task notice failed:', error.message);
    res.status(500).json({ error: 'Unable to load interruption notice' });
  }
});

app.post('/api/prompt/enhance', (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });
  res.json({ original: prompt, enhanced: generation.enhancePrompt(prompt) });
});

app.get('/api/prompt-history', auth.authMiddleware, async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, prompt, model, task_id, created_at,
            EXISTS (
              SELECT 1 FROM image_references ir
              WHERE ir.deleted_at IS NULL AND (
                ir.task_id = latest.task_id
                OR (ir.batch_id IS NOT NULL AND ir.batch_id = (
                  SELECT batch_id FROM image_tasks it WHERE it.task_id = latest.task_id
                ))
              )
            ) AS has_reference
     FROM (
       SELECT DISTINCT ON (prompt) id, prompt, model, task_id, created_at
       FROM prompt_history WHERE email=$1
       ORDER BY prompt, created_at DESC
     ) latest
     ORDER BY created_at DESC
     LIMIT 100`,
    [req.user.email]
  );
  res.json(rows.map(r => ({ id: String(r.id), prompt: r.prompt, model: r.model || '', taskId: r.task_id || null, hasReference: Boolean(r.has_reference), createdAt: r.created_at })));
});

app.post('/api/prompt-history', auth.authMiddleware, async (req, res) => {
  const { prompt, model } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });
  await db.query('INSERT INTO prompt_history(email, prompt, model) VALUES($1,$2,$3)', [req.user.email, prompt, model || '']);
  res.json({ ok: true });
});

app.delete('/api/prompt-history/:id', auth.authMiddleware, async (req, res) => {
  await db.query('DELETE FROM prompt_history WHERE id=$1 AND email=$2', [req.params.id, req.user.email]);
  res.json({ ok: true });
});

app.delete('/api/prompt-history', auth.authMiddleware, async (req, res) => {
  await db.query('DELETE FROM prompt_history WHERE email=$1', [req.user.email]);
  res.json({ ok: true });
});

app.get('/api/public/results', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const sort = req.query.sort === 'popular' ? 'popular' : 'newest';
  const requestedTaskId = String(req.query.taskId || '').slice(0, 200);
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  const viewer = await auth.resolveTokenUser(token);
  const viewerEmail = viewer?.role === 'user' ? viewer.email : null;
  const savedOnly = req.query.saved === 'true' && Boolean(viewerEmail);
  const orderBy = sort === 'popular'
    ? `((SELECT count(*) FROM public_post_likes ranked_like WHERE ranked_like.task_id=r.task_id)
        + 2 * (SELECT count(*) FROM public_posts ranked_remix WHERE ranked_remix.remix_parent_task_id=r.task_id)) DESC,
       COALESCE(p.published_at,r.created_at) DESC`
    : 'COALESCE(p.published_at,r.created_at) DESC';
  const taskFilter = requestedTaskId ? ' AND r.task_id=$4' : '';
  const savedFilter = savedOnly ? ' AND EXISTS(SELECT 1 FROM public_post_saves saved WHERE saved.task_id=r.task_id AND saved.email=$3)' : '';
  const itemParams = requestedTaskId ? [limit, offset, viewerEmail, requestedTaskId] : [limit, offset, viewerEmail];
  const [itemsResult, countResult] = await Promise.all([
    db.query(
      `SELECT r.task_id,r.email,r.result,r.created_at,p.creator_name,p.caption,p.tags,p.show_prompt,p.allow_prompt_copy,p.allow_remix,p.remix_parent_task_id,
        parent.creator_name AS remix_parent_creator,COALESCE(p.published_at,r.created_at) AS published_at,
        (SELECT count(*)::int FROM public_post_likes l WHERE l.task_id=r.task_id) AS like_count,
        (SELECT count(*)::int FROM public_post_saves s WHERE s.task_id=r.task_id) AS save_count,
        (SELECT count(*)::int FROM public_posts child WHERE child.remix_parent_task_id=r.task_id) AS remix_count,
        CASE WHEN $3::text IS NULL THEN false ELSE EXISTS(SELECT 1 FROM public_post_likes l WHERE l.task_id=r.task_id AND l.email=$3) END AS liked,
        CASE WHEN $3::text IS NULL THEN false ELSE EXISTS(SELECT 1 FROM public_post_saves s WHERE s.task_id=r.task_id AND s.email=$3) END AS saved
       FROM image_results r LEFT JOIN public_posts p ON p.task_id=r.task_id
       LEFT JOIN public_posts parent ON parent.task_id=p.remix_parent_task_id
       WHERE r.deleted_at IS NULL AND r.result->>'isPublic'='true'${taskFilter}${savedFilter}
       ORDER BY ${orderBy} LIMIT $1 OFFSET $2`,
      itemParams
    ),
    savedOnly
      ? db.query("SELECT count(*)::int AS total FROM image_results r WHERE r.deleted_at IS NULL AND r.result->>'isPublic'='true' AND EXISTS(SELECT 1 FROM public_post_saves s WHERE s.task_id=r.task_id AND s.email=$1)", [viewerEmail])
      : requestedTaskId
      ? db.query("SELECT count(*)::int AS total FROM image_results WHERE deleted_at IS NULL AND result->>'isPublic'='true' AND task_id=$1", [requestedTaskId])
      : db.query("SELECT count(*)::int AS total FROM image_results WHERE deleted_at IS NULL AND result->>'isPublic'='true'")
  ]);
  const items = itemsResult.rows.map(row => {
    const email = row.email || '';
    const at = email.indexOf('@');
    const maskedEmail = at > 0 ? `${email.slice(0, Math.min(2, at))}***${email.slice(at)}` : 'anonymous';
    const prompt = (row.result.originalPrompt || row.result.prompt || '').toLowerCase();
    const nsfwWords = ['nsfw', 'nude', 'naked', 'topless', 'sex', 'sexual', 'porn', 'xxx', 'hentai', 'bikini', 'lingerie', 'revealing', 'intimate', 'erotic', 'nsfw'];
    const isNsfw = nsfwWords.some(w => prompt.includes(w));
    return {
      taskId: row.task_id,
      url: `/api/media/result/${encodeURIComponent(row.task_id)}`,
      thumbnailUrl: `/api/media/thumbnail/${encodeURIComponent(row.task_id)}`,
      prompt: row.show_prompt ? (row.result.originalPrompt || row.result.prompt || '') : '',
      model: row.result.model || '',
      ratio: row.result.ratio || '',
      resolution: row.result.resolution || '',
      estimatedCredit: row.result.estimatedCredit || 0,
      email: 'anonymous',
      creatorName: row.creator_name || 'Kreator Piksel',
      timestamp: row.published_at || row.result.timestamp || row.created_at,
      caption: row.caption || '',
      tags: row.tags || [],
      likeCount: row.like_count || 0,
      saveCount: row.save_count || 0,
      remixCount: row.remix_count || 0,
      liked: Boolean(row.liked),
      saved: Boolean(row.saved),
      showPrompt: Boolean(row.show_prompt),
      allowPromptCopy: Boolean(row.show_prompt && row.allow_prompt_copy),
      allowRemix: Boolean(row.show_prompt && row.allow_remix),
      canRemix: Boolean(row.show_prompt && row.allow_remix && REFERENCE_IMAGE_MODELS.has(row.result.model || '')),
      remixParentTaskId: row.remix_parent_task_id || null,
      remixParentCreator: row.remix_parent_creator || null,
      negativePrompt: row.result.negativePrompt || '',
      blurred: isNsfw,
    };
  });
  res.json({ items, total: countResult.rows[0].total, page, limit, sort, savedOnly });
});

app.put('/api/results/:taskId/public', auth.authMiddleware, async (req, res) => {
  const taskId = String(req.params.taskId);
  const isPublic = Boolean(req.body?.isPublic);
  const caption = String(req.body?.caption || '').trim().slice(0, 500);
  const tags = Array.isArray(req.body?.tags) ? [...new Set(req.body.tags.map(tag => String(tag).trim().toLowerCase().replace(/^#/, '').slice(0, 30)).filter(Boolean))].slice(0, 5) : [];
  const requestedCreatorName = String(req.body?.creatorName || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  const showPrompt = req.body?.showPrompt !== false;
  const allowPromptCopy = showPrompt && req.body?.allowPromptCopy !== false;
  const allowRemix = showPrompt && req.body?.allowRemix === true;
  const { rows } = await db.query(
    `SELECT r.email,r.result,t.remix_parent_task_id
     FROM image_results r LEFT JOIN image_tasks t ON t.task_id=r.task_id
     WHERE r.task_id=$1 AND r.deleted_at IS NULL`,
    [taskId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Result not found' });
  if (rows[0].email !== req.user.email) return res.status(403).json({ error: 'Forbidden' });
  const updatedResult = { ...rows[0].result, isPublic };
  await db.query('UPDATE image_results SET result = $2 WHERE task_id = $1', [taskId, JSON.stringify(updatedResult)]);
  if (isPublic) {
    const profile = await credits.getUser(req.user.email);
    const fallbackCreatorName = profile?.telegramUsername ? `@${String(profile.telegramUsername).replace(/^@/, '').slice(0, 49)}` : String(profile?.displayName || 'Kreator Piksel').slice(0, 50);
    const creatorName = requestedCreatorName || fallbackCreatorName || 'Kreator Piksel';
    await db.query(`INSERT INTO public_posts(task_id,owner_email,creator_name,caption,tags,show_prompt,allow_prompt_copy,allow_remix,remix_parent_task_id,published_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())
      ON CONFLICT(task_id) DO UPDATE SET creator_name=$3,caption=$4,tags=$5,show_prompt=$6,allow_prompt_copy=$7,allow_remix=$8,
        remix_parent_task_id=COALESCE(public_posts.remix_parent_task_id,$9),updated_at=now()`,
      [taskId, req.user.email, creatorName, caption, tags, showPrompt, allowPromptCopy, allowRemix, rows[0].remix_parent_task_id || null]);
  } else {
    await db.query('DELETE FROM public_posts WHERE task_id=$1', [taskId]);
  }
  await userActivity.logActivity(req.user.email, isPublic ? 'explore.published' : 'explore.unpublished', req, { taskId, tags });
  res.json({ ok: true, isPublic, caption, tags, creatorName: requestedCreatorName || null, showPrompt, allowPromptCopy, allowRemix });
});

app.put('/api/public/posts/:taskId/like', auth.authMiddleware, async (req, res) => {
  const taskId = String(req.params.taskId), liked = Boolean(req.body?.liked);
  const visible = await db.query("SELECT 1 FROM image_results WHERE task_id=$1 AND deleted_at IS NULL AND result->>'isPublic'='true'", [taskId]);
  if (!visible.rows[0]) return res.status(404).json({ error: 'Post not found' });
  if (liked) await db.query('INSERT INTO public_post_likes(task_id,email) VALUES($1,$2) ON CONFLICT DO NOTHING', [taskId, req.user.email]);
  else await db.query('DELETE FROM public_post_likes WHERE task_id=$1 AND email=$2', [taskId, req.user.email]);
  const count = await db.query('SELECT count(*)::int AS total FROM public_post_likes WHERE task_id=$1', [taskId]);
  res.json({ ok: true, liked, likeCount: count.rows[0].total });
});

app.put('/api/public/posts/:taskId/save', auth.authMiddleware, async (req, res) => {
  const taskId = String(req.params.taskId), saved = Boolean(req.body?.saved);
  const visible = await db.query("SELECT 1 FROM image_results WHERE task_id=$1 AND deleted_at IS NULL AND result->>'isPublic'='true'", [taskId]);
  if (!visible.rows[0]) return res.status(404).json({ error: 'Post not found' });
  if (saved) await db.query('INSERT INTO public_post_saves(task_id,email) VALUES($1,$2) ON CONFLICT DO NOTHING', [taskId, req.user.email]);
  else await db.query('DELETE FROM public_post_saves WHERE task_id=$1 AND email=$2', [taskId, req.user.email]);
  const count = await db.query('SELECT count(*)::int AS total FROM public_post_saves WHERE task_id=$1', [taskId]);
  res.json({ ok: true, saved, saveCount: count.rows[0].total });
});

app.post('/api/public/posts/:taskId/report', auth.authMiddleware, async (req, res) => {
  const taskId = String(req.params.taskId);
  const allowedReasons = new Set(['spam', 'misleading', 'privacy', 'other']);
  const reason = allowedReasons.has(req.body?.reason) ? req.body.reason : 'other';
  const details = String(req.body?.details || '').trim().slice(0, 500);
  const visible = await db.query("SELECT 1 FROM image_results WHERE task_id=$1 AND deleted_at IS NULL AND result->>'isPublic'='true'", [taskId]);
  if (!visible.rows[0]) return res.status(404).json({ error: 'Post not found' });
  await db.query(`INSERT INTO public_post_reports(task_id,email,reason,details,status,created_at) VALUES($1,$2,$3,$4,'open',now())
    ON CONFLICT(task_id,email) DO UPDATE SET reason=$3,details=$4,status='open',created_at=now()`, [taskId, req.user.email, reason, details]);
  await userActivity.logActivity(req.user.email, 'explore.reported', req, { taskId, reason });
  res.json({ ok: true });
});

app.put('/api/results/:taskId/favorite', auth.authMiddleware, async (req, res) => {
  const taskId = String(req.params.taskId);
  const isFavorite = Boolean(req.body?.isFavorite);
  const { rows } = await db.query('SELECT email FROM image_results WHERE task_id=$1 AND deleted_at IS NULL', [taskId]);
  if (!rows[0]) return res.status(404).json({ error: 'Result not found' });
  if (rows[0].email !== req.user.email) return res.status(403).json({ error: 'Forbidden' });
  await db.query('UPDATE image_results SET is_favorite = $2 WHERE task_id = $1', [taskId, isFavorite]);
  res.json({ ok: true, isFavorite });
});

function hashShareToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

app.post('/api/results/:taskId/shares', auth.authMiddleware, async (req, res) => {
  const taskId = String(req.params.taskId);
  const expiresInDays = [1, 7, 30].includes(Number(req.body?.expiresInDays)) ? Number(req.body.expiresInDays) : 7;
  const allowDownload = Boolean(req.body?.allowDownload);
  const owned = await db.query('SELECT 1 FROM image_results WHERE task_id=$1 AND email=$2 AND deleted_at IS NULL', [taskId, req.user.email]);
  if (!owned.rows[0]) return res.status(404).json({ error: 'Result not found' });
  const active = await db.query('SELECT count(*)::int AS total FROM result_shares WHERE task_id=$1 AND owner_email=$2 AND revoked_at IS NULL AND expires_at>now()', [taskId, req.user.email]);
  if (active.rows[0].total >= 20) return res.status(429).json({ error: 'Revoke an existing link before creating another' });
  const token = crypto.randomBytes(32).toString('base64url');
  const id = `share_${crypto.randomBytes(10).toString('hex')}`;
  const created = await db.query(`INSERT INTO result_shares(id,token_hash,task_id,owner_email,expires_at,allow_download)
    VALUES($1,$2,$3,$4,now()+($5::int*interval '1 day'),$6)
    RETURNING id,expires_at AS "expiresAt",allow_download AS "allowDownload",created_at AS "createdAt"`,
    [id, hashShareToken(token), taskId, req.user.email, expiresInDays, allowDownload]);
  const proto = req.get('x-forwarded-proto')?.split(',')[0].trim() || req.protocol;
  const shareUrl = `${proto}://${req.get('host')}/share/${token}`;
  await userActivity.logActivity(req.user.email, 'gallery.share_created', req, { taskId, shareId: id, expiresInDays, allowDownload });
  res.status(201).json({ ...created.rows[0], shareUrl });
});

app.get('/api/results/:taskId/shares', auth.authMiddleware, async (req, res) => {
  const taskId = String(req.params.taskId);
  const owned = await db.query('SELECT 1 FROM image_results WHERE task_id=$1 AND email=$2 AND deleted_at IS NULL', [taskId, req.user.email]);
  if (!owned.rows[0]) return res.status(404).json({ error: 'Result not found' });
  const links = await db.query(`SELECT id,expires_at AS "expiresAt",allow_download AS "allowDownload",view_count AS "viewCount",
    last_viewed_at AS "lastViewedAt",revoked_at AS "revokedAt",created_at AS "createdAt",
    (revoked_at IS NULL AND expires_at>now()) AS active
    FROM result_shares WHERE task_id=$1 AND owner_email=$2 ORDER BY created_at DESC LIMIT 50`, [taskId, req.user.email]);
  res.json({ items: links.rows });
});

app.delete('/api/shares/:id', auth.authMiddleware, async (req, res) => {
  const revoked = await db.query(`UPDATE result_shares SET revoked_at=COALESCE(revoked_at,now())
    WHERE id=$1 AND owner_email=$2 RETURNING id,task_id`, [String(req.params.id), req.user.email]);
  if (!revoked.rows[0]) return res.status(404).json({ error: 'Share link not found' });
  await userActivity.logActivity(req.user.email, 'gallery.share_revoked', req, { taskId: revoked.rows[0].task_id, shareId: revoked.rows[0].id });
  res.json({ ok: true });
});

app.get('/api/shared/:token', async (req, res) => {
  const tokenHash = hashShareToken(req.params.token);
  const shared = await db.query(`SELECT s.id,s.expires_at,s.allow_download,s.view_count,r.task_id,r.result,r.created_at
    FROM result_shares s JOIN image_results r ON r.task_id=s.task_id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND r.deleted_at IS NULL`, [tokenHash]);
  if (!shared.rows[0]) return res.status(404).json({ error: 'Share link is invalid, expired, or revoked' });
  const row = shared.rows[0];
  await db.query('UPDATE result_shares SET view_count=view_count+1,last_viewed_at=now() WHERE id=$1', [row.id]);
  res.set('Cache-Control', 'private, no-store');
  res.json({
    imageUrl: `/api/media/shared/${encodeURIComponent(req.params.token)}`,
    downloadUrl: row.allow_download ? `/api/media/shared/${encodeURIComponent(req.params.token)}?download=1` : null,
    allowDownload: Boolean(row.allow_download),
    expiresAt: row.expires_at,
    timestamp: row.result.timestamp || row.created_at,
  });
});

app.get('/api/media/shared/:token', async (req, res) => {
  const tokenHash = hashShareToken(req.params.token);
  const shared = await db.query(`SELECT s.allow_download,r.result
    FROM result_shares s JOIN image_results r ON r.task_id=s.task_id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND r.deleted_at IS NULL`, [tokenHash]);
  if (!shared.rows[0]) return res.status(404).end();
  const wantsDownload = req.query.download === '1';
  if (wantsDownload && !shared.rows[0].allow_download) return res.status(403).end();
  const result = shared.rows[0].result || {};
  const storagePath = result.storagePath;
  const legacyUrl = String(result.localUrl || '');
  const legacyPath = legacyUrl.startsWith('/images/') ? path.join(publicDir, legacyUrl.slice(1)) : '';
  const filePath = storagePath && fs.existsSync(storagePath) ? storagePath : legacyPath && fs.existsSync(legacyPath) ? legacyPath : '';
  if (!filePath) return res.status(404).end();
  res.set('Cache-Control', 'private, no-store');
  res.set('Referrer-Policy', 'no-referrer');
  if (wantsDownload) res.set('Content-Disposition', `attachment; filename="Piksel-shared${path.extname(filePath) || '.png'}"`);
  res.sendFile(path.resolve(filePath));
});

app.get('/api/results/favorites', auth.authMiddleware, async (req, res) => {
  const { rows } = await db.query(
    `SELECT task_id, email, result, created_at, is_favorite 
     FROM image_results 
     WHERE email = $1 AND is_favorite = true AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [req.user.email]
  );
  
  const items = rows.map(row => ({
    taskId: row.task_id,
    url: `/api/media/result/${encodeURIComponent(row.task_id)}`,
    thumbnailUrl: `/api/media/thumbnail/${encodeURIComponent(row.task_id)}`,
    prompt: row.result.originalPrompt || row.result.prompt,
    model: row.result.model,
    ratio: row.result.ratio,
    resolution: row.result.resolution,
    estimatedCredit: row.result.estimatedCredit,
    timestamp: row.result.timestamp || row.created_at,
    isPublic: Boolean(row.result.isPublic),
    isFavorite: Boolean(row.is_favorite),
  }));
  
  res.json({ items });
});

app.get('/api/payments', auth.authMiddleware, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1), limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  res.json(await payments.listPayments(req.user.email, page, limit));
});

app.get('/api/payments/:orderId', auth.authMiddleware, async (req, res) => {
  const payment = await payments.getPayment(req.user.email, req.params.orderId);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  res.json(payment);
});

app.get('/api/admin/payments', auth.adminMiddleware, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1), limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  res.json(await payments.listPayments(null, page, limit));
});

app.get('/api/admin/keys/health', auth.adminMiddleware, async (req, res) => {
  const keys = await poolModule.listKeys();
  res.json(keys.map(({ key, ...item }) => item));
});

app.post('/api/admin/keys/:id/check', auth.adminMiddleware, async (req, res) => {
  const key = await poolModule.checkKey(req.params.id);
  if (!key) return res.status(404).json({ error: 'Key not found' });
  await audit.record(req, 'key.check', 'api_key', req.params.id, { status: key.healthStatus });
  const { key: raw, ...safe } = key;
  res.json({ ok: true, key: safe });
});

app.get('/api/admin/dashboard', auth.adminMiddleware, async (req, res) => {
  const [users, tasks, paymentsSummary, keys, storage] = await Promise.all([
    db.query('SELECT count(*)::int AS total,count(*) FILTER(WHERE suspended_at IS NOT NULL)::int AS suspended,COALESCE(sum(credits),0)::int AS credits FROM users'),
    db.query("SELECT count(*) FILTER(WHERE status='queued')::int AS queued,count(*) FILTER(WHERE status='running')::int AS running,count(*) FILTER(WHERE status='done')::int AS done,count(*) FILTER(WHERE status='error')::int AS failed,count(*) FILTER(WHERE status='cancelled')::int AS cancelled FROM image_tasks"),
    db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='completed')::int AS completed,COALESCE(sum(paid_amount) FILTER(WHERE status='completed'),0)::bigint AS revenue FROM payments"),
    db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE health_status='healthy')::int AS healthy,count(*) FILTER(WHERE health_status IN ('auth','degraded','exhausted'))::int AS unhealthy FROM api_keys"),
    db.query("SELECT count(*)::int AS results FROM image_results WHERE deleted_at IS NULL"),
  ]);
  const disk = { total: 0, used: 0, available: 0, usedPercent: 0, imagesSize: 0, imagesCount: 0, refsSize: 0, refsCount: 0 };
  try {
    const os = require('os');
    const { execSync } = require('child_process');
    const df = execSync('df -B1 / | tail -1', { timeout: 3000 }).toString().trim().split(/\s+/);
    if (df.length >= 4) {
      disk.total = parseInt(df[1], 10) || 0;
      disk.used = parseInt(df[2], 10) || 0;
      disk.available = parseInt(df[3], 10) || 0;
      disk.usedPercent = disk.total > 0 ? Math.round((disk.used / disk.total) * 100) : 0;
    }
    const imgDir = path.join(config.PUBLIC_DIR, 'images');
    disk.imagesSize = parseInt(execSync(`du -sb "${imgDir}" 2>/dev/null | cut -f1 || echo 0`, { timeout: 3000 }).toString().trim(), 10) || 0;
    disk.imagesCount = parseInt(execSync(`ls "${imgDir}" 2>/dev/null | wc -l || echo 0`, { timeout: 3000 }).toString().trim(), 10) || 0;
    const refDir = path.join(config.STORAGE_DIR, 'references');
    disk.refsSize = parseInt(execSync(`du -sb "${refDir}" 2>/dev/null | cut -f1 || echo 0`, { timeout: 3000 }).toString().trim(), 10) || 0;
    disk.refsCount = parseInt(execSync(`ls "${refDir}" 2>/dev/null | wc -l || echo 0`, { timeout: 3000 }).toString().trim(), 10) || 0;
  } catch (_) {}
  res.json({ users: users.rows[0], tasks: tasks.rows[0], payments: paymentsSummary.rows[0], keys: keys.rows[0], gallery: storage.rows[0], queue: generation.queueSnapshot(), disk });
});

app.get('/api/admin/audit', auth.adminMiddleware, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1), limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const action = String(req.query.action || '').slice(0, 100), params = [];
  const where = action ? (params.push(action), 'WHERE action=$1') : '';
  const count = await db.query(`SELECT count(*)::int AS total FROM admin_audit_log ${where}`, params);
  params.push(limit, (page - 1) * limit);
  const li = action ? 2 : 1;
  const rows = await db.query(`SELECT id,actor,action,target_type AS "targetType",target_id AS "targetId",metadata,ip,created_at AS "createdAt" FROM admin_audit_log ${where} ORDER BY created_at DESC LIMIT $${li} OFFSET $${li + 1}`, params);
  res.json({ items: rows.rows, total: count.rows[0].total, page, limit });
});

// User activity log endpoints
app.get('/api/admin/user-activity', auth.adminMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const params = [], where = [];
    if (req.query.action) { params.push(String(req.query.action).slice(0, 100)); where.push(`action=$${params.length}`); }
    if (req.query.email) { params.push(`%${String(req.query.email).toLowerCase().slice(0, 200)}%`); where.push(`LOWER(email) LIKE $${params.length}`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await db.query(`SELECT count(*)::int AS total FROM user_activity_log ${clause}`, params);
    params.push(limit, (page - 1) * limit);
    const rows = await db.query(`SELECT id,email,action,ip,user_agent AS "userAgent",metadata,created_at AS "createdAt" FROM user_activity_log ${clause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ items: rows.rows, total: count.rows[0].total, page, limit });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/user/:email/activity', auth.adminMiddleware, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const activity = await userActivity.getActivity(req.params.email, limit);
    res.json({ items: activity });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/suspicious-activity', auth.adminMiddleware, async (req, res) => {
  try {
    const hours = Math.min(168, Math.max(1, parseInt(req.query.hours, 10) || 24));
    const suspicious = await userActivity.getSuspiciousActivity(hours);
    res.json({ items: suspicious, hours });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/user/activity', auth.authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const activity = await userActivity.getActivity(req.user.email, limit);
    res.json({ items: activity });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== ENHANCED QUEUE MANAGEMENT ENDPOINTS ==========

// Get queue with filters and analytics
app.get('/api/admin/queue', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const { status, model, user, sort } = req.query;
    
    const params = [];
    const where = ["status IN ('queued', 'running')"];
    
    if (status && status !== 'all') {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    
    if (model && model !== 'all') {
      params.push(model);
      where.push(`model = $${params.length}`);
    }
    
    if (user) {
      params.push(`%${user.toLowerCase()}%`);
      where.push(`LOWER(email) LIKE $${params.length}`);
    }
    
    const whereClause = where.join(' AND ');
    
    let orderBy = 'created_at ASC';
    if (sort === 'cost_desc') orderBy = 'cost DESC, created_at ASC';
    else if (sort === 'cost_asc') orderBy = 'cost ASC, created_at ASC';
    else if (sort === 'model') orderBy = 'model, created_at ASC';
    
    const tasks = await query(`
      SELECT 
        task_id, email, status, prompt, model, ratio, resolution, cost,
        created_at, started_at, finished_at, cancel_requested_at, cancelled_at,
        retry_of, retry_count, error, queue_position, estimated_completion
      FROM image_tasks
      WHERE ${whereClause}
      ORDER BY ${orderBy}
    `, params);
    
    // Get queue stats
    const stats = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'queued')::int as queued,
        COUNT(*) FILTER (WHERE status = 'running')::int as active,
        COUNT(*) FILTER (WHERE cancel_requested_at IS NOT NULL AND cancelled_at IS NULL)::int as stop_requested
      FROM image_tasks
      WHERE status IN ('queued', 'running')
    `);
    
    // Get config
    const config = await query('SELECT * FROM queue_config WHERE id = 1');
    
    // Calculate avg wait time for queued tasks
    const avgWait = await query(`
      SELECT AVG(EXTRACT(EPOCH FROM (COALESCE(started_at, now()) - created_at)))::int as avg_wait_seconds
      FROM image_tasks
      WHERE status = 'running' AND started_at IS NOT NULL
        AND created_at > now() - interval '1 hour'
    `);
    
    // Calculate avg processing time
    const avgProcessing = await query(`
      SELECT AVG(processing_duration)::int as avg_processing_seconds
      FROM image_tasks
      WHERE processing_duration IS NOT NULL
        AND finished_at > now() - interval '1 hour'
    `);
    
    res.json({
      tasks: tasks.rows.map((t, idx) => ({
        taskId: t.task_id,
        email: t.email,
        status: t.status,
        prompt: t.prompt,
        model: t.model,
        ratio: t.ratio,
        resolution: t.resolution,
        cost: t.cost,
        createdAt: t.created_at,
        startedAt: t.started_at,
        finishedAt: t.finished_at,
        cancelRequestedAt: t.cancel_requested_at,
        cancelledAt: t.cancelled_at,
        retryOf: t.retry_of,
        retryCount: t.retry_count,
        error: t.error,
        position: t.status === 'queued' ? idx + 1 : null,
        estimatedCompletion: t.estimated_completion
      })),
      stats: {
        queued: stats.rows[0].queued,
        active: stats.rows[0].active,
        stopRequested: stats.rows[0].stop_requested,
        maxConcurrent: config.rows[0].max_concurrent,
        maxQueued: config.rows[0].max_queued,
        paused: config.rows[0].paused,
        avgWaitTime: avgWait.rows[0]?.avg_wait_seconds || 0,
        avgProcessingTime: avgProcessing.rows[0]?.avg_processing_seconds || 0
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get queue history (completed, failed, cancelled)
app.get('/api/admin/queue/history', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const { type = 'completed', limit = 100 } = req.query;
    
    let whereClause = "status = 'done'";
    if (type === 'failed') whereClause = "status = 'error'";
    else if (type === 'cancelled') whereClause = "status = 'cancelled'";
    
    const tasks = await query(`
      SELECT 
        task_id, email, status, prompt, model, ratio, resolution, cost,
        created_at, started_at, finished_at, cancelled_at, error,
        processing_duration, retry_count
      FROM image_tasks
      WHERE ${whereClause}
      ORDER BY COALESCE(finished_at, cancelled_at, created_at) DESC
      LIMIT $1
    `, [parseInt(limit)]);
    
    res.json(tasks.rows.map(t => ({
      taskId: t.task_id,
      email: t.email,
      status: t.status,
      prompt: t.prompt,
      model: t.model,
      cost: t.cost,
      createdAt: t.created_at,
      finishedAt: t.finished_at,
      cancelledAt: t.cancelled_at,
      processingDuration: t.processing_duration,
      error: t.error
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get queue analytics
app.get('/api/admin/queue/analytics', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    
    const [today, models, users] = await Promise.all([
      // Today's stats
      query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'done')::int as completed,
          COUNT(*) FILTER (WHERE status = 'error')::int as failed,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int as cancelled,
          COUNT(*)::int as total,
          AVG(processing_duration) FILTER (WHERE processing_duration IS NOT NULL)::int as avg_duration,
          COALESCE(SUM(cost) FILTER (WHERE status = 'done'), 0)::int as credits_used
        FROM image_tasks
        WHERE created_at > CURRENT_DATE
      `),
      // Stats by model
      query(`
        SELECT 
          model,
          COUNT(*)::int as count,
          COUNT(*) FILTER (WHERE status = 'done')::int as completed,
          AVG(processing_duration) FILTER (WHERE processing_duration IS NOT NULL)::int as avg_duration
        FROM image_tasks
        WHERE created_at > now() - interval '24 hours'
        GROUP BY model
        ORDER BY count DESC
      `),
      // Top users
      query(`
        SELECT 
          email,
          COUNT(*)::int as count,
          SUM(cost)::int as total_cost
        FROM image_tasks
        WHERE created_at > CURRENT_DATE
        GROUP BY email
        ORDER BY count DESC
        LIMIT 10
      `)
    ]);
    
    res.json({
      today: today.rows[0],
      byModel: models.rows,
      topUsers: users.rows
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk cancel tasks
app.post('/api/admin/queue/bulk-cancel', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const { taskIds, cancelAll, email } = req.body;
    
    let whereClause = "status IN ('queued', 'running')";
    const params = [];
    
    if (taskIds && Array.isArray(taskIds)) {
      params.push(taskIds);
      whereClause += ` AND task_id = ANY($${params.length}::text[])`;
    } else if (cancelAll) {
      whereClause += " AND status = 'queued'"; // Only cancel queued, not running
    } else if (email) {
      params.push(email);
      whereClause += ` AND email = $${params.length}`;
    }
    
    const selected = await query(`SELECT task_id FROM image_tasks WHERE ${whereClause} AND status = 'queued'`, params);
    const tasks = [];
    for (const row of selected.rows) {
      const result = await generation.cancelTask(row.task_id, req.user?.email || 'admin');
      if (result?.status === 'cancelled') tasks.push({ task_id: row.task_id });
    }
    
    await audit.record(req, 'queue.bulk_cancel', 'task', null, { count: tasks.length });
    res.json({ ok: true, cancelled: tasks.length, tasks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pause/Resume queue
app.post('/api/admin/queue/pause', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const { paused } = req.body;
    
    await query('UPDATE queue_config SET paused = $1, updated_at = now() WHERE id = 1', [!!paused]);
    generation.applyQueueConfig({ paused: !!paused });
    await audit.record(req, 'queue.pause', 'queue', null, { paused: !!paused });
    res.json({ ok: true, paused: !!paused });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update queue config
app.patch('/api/admin/queue/config', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const { maxConcurrent, maxQueued, autoRetryFailed, autoCancelOldMinutes } = req.body;
    
    const updates = [];
    const params = [];
    
    if (maxConcurrent !== undefined) {
      const value = parseInt(maxConcurrent, 10);
      if (!Number.isInteger(value) || value < 1 || value > 50) return res.status(400).json({ error: 'maxConcurrent must be between 1 and 50' });
      params.push(value);
      updates.push(`max_concurrent = $${params.length}`);
    }
    if (maxQueued !== undefined) {
      const value = parseInt(maxQueued, 10);
      if (!Number.isInteger(value) || value < 1 || value > 1000) return res.status(400).json({ error: 'maxQueued must be between 1 and 1000' });
      params.push(value);
      updates.push(`max_queued = $${params.length}`);
    }
    if (autoRetryFailed !== undefined) {
      params.push(!!autoRetryFailed);
      updates.push(`auto_retry_failed = $${params.length}`);
    }
    if (autoCancelOldMinutes !== undefined) {
      params.push(parseInt(autoCancelOldMinutes));
      updates.push(`auto_cancel_old_minutes = $${params.length}`);
    }
    
    if (updates.length > 0) {
      updates.push('updated_at = now()');
      await query(`UPDATE queue_config SET ${updates.join(', ')} WHERE id = 1`, params);
    }
    
    const config = await query('SELECT * FROM queue_config WHERE id = 1');
    generation.applyQueueConfig(config.rows[0]);
    await audit.record(req, 'queue.config_update', 'queue', null, req.body);
    res.json({ ok: true, config: config.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Kill stuck tasks (running > threshold)
app.post('/api/admin/queue/kill-stuck', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const { minutes = 10 } = req.body;
    
    const threshold = Math.min(1440, Math.max(1, parseInt(minutes, 10) || 10));
    const result = await query(`SELECT task_id,email,model FROM image_tasks WHERE status='running' AND started_at < now() - ($1 * interval '1 minute')`, [threshold]);
    for (const row of result.rows) await generation.cancelTask(row.task_id, req.user?.email || 'admin');
    
    await audit.record(req, 'queue.kill_stuck', 'task', null, { count: result.rows.length, minutes: threshold });
    res.json({ ok: true, killed: result.rows.length, cancellationRequested: result.rows.length, tasks: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get task detail
app.get('/api/admin/tasks/:id/detail', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const taskId = req.params.id;
    
    const [task, user, retries] = await Promise.all([
      query('SELECT * FROM image_tasks WHERE task_id = $1', [taskId]),
      query('SELECT email, credits, unlimited FROM users WHERE email = (SELECT email FROM image_tasks WHERE task_id = $1)', [taskId]),
      query('SELECT task_id, status, created_at, finished_at FROM image_tasks WHERE retry_of = $1 ORDER BY created_at DESC', [taskId])
    ]);
    
    if (!task.rows[0]) return res.status(404).json({ error: 'Task not found' });
    
    res.json({
      task: task.rows[0],
      user: user.rows[0],
      retries: retries.rows
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Priority boost (move to front)
app.post('/api/admin/tasks/:id/priority', auth.adminMiddleware, async (req, res) => {
  try {
    const { query } = require('./src/db');
    const taskId = req.params.id;
    
    const result = await query("SELECT task_id,email FROM image_tasks WHERE task_id=$1 AND status='queued'", [taskId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or not queued' });
    }
    if (!generation.prioritizeTask(taskId)) return res.status(409).json({ error: 'Task is queued in the database but not available in the live worker queue' });
    
    await audit.record(req, 'task.priority_boost', 'task', taskId);
    res.json({ ok: true, task: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/tasks/:id/cancel', auth.adminMiddleware, async (req, res) => {
  const result = await generation.cancelTask(String(req.params.id), 'admin');
  if (!result) return res.status(404).json({ error: 'Task not found' });
  await audit.record(req, 'task.cancel', 'image_task', req.params.id, result);
  res.json({ ok: true, ...result });
});

app.post('/api/admin/tasks/:id/retry', auth.adminMiddleware, async (req, res) => {
  const found = await db.query("SELECT * FROM image_tasks WHERE task_id=$1 AND status IN ('error','cancelled')", [req.params.id]);
  if (!found.rows[0]) return res.status(409).json({ error: 'Only error or cancelled tasks can be retried' });
  const refs = await db.query(
    `SELECT count(*)::int AS total FROM image_references
     WHERE task_id=$1 OR (batch_id IS NOT NULL AND batch_id=(SELECT batch_id FROM image_tasks WHERE task_id=$1))`,
    [req.params.id]
  );
  if (refs.rows[0].total > 0) return res.status(409).json({ error: 'Tasks with reference images cannot be retried because provider upload inputs are not safely reconstructable' });
  const old = found.rows[0], taskId = `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const user = await credits.getUser(old.email);
  if (!user || (!user.unlimited && !await credits.deductCredits(old.email, old.cost, 'retry'))) return res.status(409).json({ error: 'Insufficient credits for retry' });
  const task = { taskId, status: 'queued', prompt: old.prompt, model: old.model, ratio: old.ratio, resolution: old.resolution, email: old.email, cost: old.cost, createdAt: new Date().toISOString() };
  generation.pendingTasks.set(taskId, task); await generation.saveTask(taskId, task);
  await db.query('UPDATE image_tasks SET retry_of=$2,retry_count=$3 WHERE task_id=$1', [taskId, old.task_id, old.retry_count + 1]);
  if (!generation.enqueueGeneration({ taskId, prompt: old.prompt, model: old.model, ratio: old.ratio, resolution: old.resolution, refFiles: [], email: old.email })) { await generation.cancelTask(taskId, 'queue'); return res.status(503).json({ error: 'Generation queue is full' }); }
  await audit.record(req, 'task.retry', 'image_task', old.task_id, { newTaskId: taskId });
  res.json({ ok: true, taskId, retryOf: old.task_id });
});

app.post('/api/results/bulk', auth.authMiddleware, async (req, res) => {
  const taskIds = Array.isArray(req.body?.taskIds) ? [...new Set(req.body.taskIds.map(String))] : [];
  if (!taskIds.length || taskIds.length > 100) return res.status(400).json({ error: 'taskIds must contain 1 to 100 unique IDs' });
  const action = req.body?.action;
  if (action === 'setVisibility') {
    const isPublic = Boolean(req.body?.isPublic);
    const result = await db.query("UPDATE image_results SET result=jsonb_set(result,'{isPublic}',to_jsonb($3::boolean),true) WHERE task_id=ANY($1::text[]) AND email=$2 AND deleted_at IS NULL RETURNING task_id", [taskIds, req.user.email, isPublic]);
    const updatedIds = result.rows.map(row => row.task_id);
    if (isPublic && updatedIds.length) {
      await db.query(`INSERT INTO public_posts(task_id,owner_email,published_at)
        SELECT task_id,email,now() FROM image_results WHERE task_id=ANY($1::text[])
        ON CONFLICT(task_id) DO UPDATE SET updated_at=now()`, [updatedIds]);
    } else if (updatedIds.length) {
      await db.query('DELETE FROM public_posts WHERE task_id=ANY($1::text[])', [updatedIds]);
    }
    return res.json({ ok: true, updated: result.rowCount });
  }
  if (action === 'delete') {
    const result = await db.query("UPDATE image_results SET deleted_at=COALESCE(deleted_at,now()),deleted_by='user_bulk',is_favorite=false,result=jsonb_set(result,'{isPublic}','false'::jsonb,true) WHERE task_id=ANY($1::text[]) AND email=$2 AND deleted_at IS NULL RETURNING task_id", [taskIds, req.user.email]);
    const deleted = result.rowCount;
    await userActivity.logActivity(req.user.email, 'gallery.bulk_deleted', req, { taskIds: result.rows.map(row => row.task_id), retainedForAdmin: true });
    return res.json({ ok: true, deleted });
  }
  res.status(400).json({ error: 'action must be setVisibility or delete' });
});

app.post('/api/results/download', auth.authMiddleware, async (req, res) => {
  const taskIds = Array.isArray(req.body?.taskIds) ? [...new Set(req.body.taskIds.map(String))] : [];
  if (!taskIds.length || taskIds.length > 20) return res.status(400).json({ error: 'taskIds must contain 1 to 20 unique IDs' });
  const { rows } = await db.query("SELECT task_id, result->>'storagePath' AS path FROM image_results WHERE task_id=ANY($1::text[]) AND email=$2 AND deleted_at IS NULL", [taskIds, req.user.email]);
  if (!rows.length) return res.status(404).json({ error: 'No results found' });
  
  const tmpDir = path.join(os.tmpdir(), 'Piksel-dl-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const files = [];
  for (const row of rows) {
    if (row.path && fs.existsSync(row.path)) {
      const dest = path.join(tmpDir, row.task_id + '.png');
      fs.copyFileSync(row.path, dest);
      files.push(dest);
    }
  }
  if (!files.length) { fs.rmSync(tmpDir, { recursive: true, force: true }); return res.status(404).json({ error: 'Files not found' }); }
  
  const zipPath = tmpDir + '.zip';
  const { execSync } = require('child_process');
  try { execSync(`zip -j "${zipPath}" "${tmpDir}"/*.png`, { stdio: 'ignore' }); } catch (_) {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
  
  if (!fs.existsSync(zipPath)) return res.status(500).json({ error: 'Failed to create zip' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="Piksel-images.zip"');
  res.sendFile(zipPath, () => { try { fs.unlinkSync(zipPath); } catch (_) {} });
});

app.post('/api/results/clear', auth.authMiddleware, async (req, res) => {
  const result = await db.query(
    "UPDATE image_results SET deleted_at=COALESCE(deleted_at,now()),deleted_by='user_clear_chat',is_favorite=false,result=jsonb_set(result,'{isPublic}','false'::jsonb,true) WHERE email=$1 AND deleted_at IS NULL RETURNING task_id",
    [req.user.email]
  );
  await userActivity.logActivity(req.user.email, 'gallery.chat_cleared', req, { count: result.rowCount, retainedForAdmin: true });
  res.json({ ok: true, deleted: result.rowCount });
});

app.get('/api/admin/plans', auth.adminMiddleware, async (req, res) => {
  res.json(await plans.getAllPlans());
});

app.post('/api/admin/plans', auth.adminMiddleware, async (req, res) => {
  try {
    const { slug, name, durationDays, priceIdr, compareAtIdr, badge, description, features, sortOrder, isActive } = req.body;
    if (!slug || !name || !durationDays || !priceIdr) return res.status(400).json({ error: 'slug, name, durationDays, priceIdr required' });
    const result = await plans.createPlan({ slug, name, durationDays, priceIdr, compareAtIdr, badge, description, features, sortOrder, isActive });
    await audit.record(req, 'plan.create', 'plan', slug);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== GRACEFUL SHUTDOWN ==========
// On deploy/restart, systemd sends SIGTERM. Instead of killing in-flight image
// generations (which previously surfaced as "Generation interrupted by server
// restart" failures), stop accepting new connections and wait for tasks that
// are currently running/queued to finish, up to a bounded deadline. This does
// NOT change how generation works, model/provider selection, moderation,
// filters, prompts, credits, or results — it only defers process exit.
let shuttingDown = false;
const SHUTDOWN_WAIT_MS = 90 * 1000;
const SHUTDOWN_POLL_MS = 1000;

function countActivePendingTasks() {
  let active = 0;
  for (const task of generation.pendingTasks.values()) {
    if (task && (task.status === 'running' || task.status === 'queued')) active++;
  }
  return active;
}

async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received; stopping new connections and draining active tasks...`);

  // Stop accepting new HTTP connections; existing responses can still complete.
  httpServer.close(() => console.log('[shutdown] HTTP server closed to new connections'));

  const deadline = Date.now() + SHUTDOWN_WAIT_MS;
  let remaining = countActivePendingTasks();
  if (remaining > 0) console.log(`[shutdown] waiting for ${remaining} active task(s) to finish...`);
  while (remaining > 0 && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, SHUTDOWN_POLL_MS));
    remaining = countActivePendingTasks();
  }

  if (remaining > 0) {
    console.warn(`[shutdown] deadline reached with ${remaining} task(s) still active; exiting anyway`);
  } else {
    console.log('[shutdown] all active tasks drained; exiting cleanly');
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

app.put('/api/admin/plans/:slug', auth.adminMiddleware, async (req, res) => {
  try {
    const { name, durationDays, priceIdr, compareAtIdr, badge, description, features, sortOrder, isActive } = req.body;
    const result = await plans.updatePlan(req.params.slug, { name, durationDays, priceIdr, compareAtIdr, badge, description, features, sortOrder, isActive });
    if (!result) return res.status(404).json({ error: 'Plan not found' });
    await audit.record(req, 'plan.update', 'plan', req.params.slug);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/plans/:slug', auth.adminMiddleware, async (req, res) => {
  const result = await plans.deletePlan(req.params.slug);
  if (!result) return res.status(404).json({ error: 'Plan not found' });
  await audit.record(req, 'plan.delete', 'plan', req.params.slug);
  res.json({ ok: true });
});

app.get('/api/admin/backups', auth.adminMiddleware, async (req, res) => {
  const rows = await db.query('SELECT id,status,archive_path AS "archivePath",byte_size AS "byteSize",error,created_by AS "createdBy",created_at AS "createdAt",finished_at AS "finishedAt" FROM backup_runs ORDER BY created_at DESC LIMIT 100');
  res.json(rows.rows);
});

// Create file backup (images/references)
app.post('/api/admin/backups', auth.adminMiddleware, async (req, res) => {
  const id = `backup_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`, dir = path.join(config.STORAGE_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const archive = path.join(dir, `${id}.tar.gz`);
  await db.query("INSERT INTO backup_runs(id,status) VALUES($1,'running')", [id]);
  const args = ['-czf', archive, '-C', config.STORAGE_DIR, 'results', 'references'];
  execFile('tar', args, async error => {
    try { if (error) await db.query("UPDATE backup_runs SET status='failed',error=$2,finished_at=now() WHERE id=$1", [id, String(error.message).slice(0, 1000)]); else await db.query("UPDATE backup_runs SET status='completed',archive_path=$2,byte_size=$3,finished_at=now() WHERE id=$1", [id, archive, fs.statSync(archive).size]); } catch (e) { console.error('Backup status update failed:', e.message); }
  });
  await audit.record(req, 'backup.create', 'backup_run', id);
  res.status(202).json({ ok: true, id, status: 'running' });
});

// Create database backup
app.post('/api/admin/backups/database', auth.adminMiddleware, async (req, res) => {
  try {
    const result = await dbBackup.createDatabaseBackup();
    await audit.record(req, 'backup.database_create', 'backup_run', result.backupId);
    res.status(202).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Restore database from backup
app.post('/api/admin/backups/:id/restore', auth.adminMiddleware, async (req, res) => {
  if (!req.body.confirm) {
    return res.status(400).json({ error: 'Confirmation required. This will overwrite the current database!' });
  }
  
  try {
    const result = await dbBackup.restoreDatabase(req.params.id);
    await audit.record(req, 'backup.database_restore', 'backup_run', req.params.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cleanup old backups
app.post('/api/admin/backups/cleanup', auth.adminMiddleware, async (req, res) => {
  const retentionDays = parseInt(req.body.retentionDays) || 30;
  try {
    const result = await dbBackup.cleanupOldBackups(retentionDays);
    await audit.record(req, 'backup.cleanup', null, null, { retention_days: retentionDays, deleted: result.deleted });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get backup statistics
app.get('/api/admin/backups/stats', auth.adminMiddleware, async (req, res) => {
  try {
    const stats = await dbBackup.getBackupStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = config.PORT;
(async () => {
  try {
    await generation.loadQueueConfig();
    await generation.loadTasks();
  } catch (error) {
    console.error('Unable to initialize generation queue:', error.message);
  }
})();

// Auto health check scheduler - check all keys every 6 hours
setInterval(async () => {
  try {
    console.log('[AUTO-HEALTH-CHECK] Running scheduled health check for all keys...');
    const keys = await poolModule.listKeys();
    let checked = 0, healthy = 0, unhealthy = 0;
    for (const key of keys) {
      if (!key.id) continue;
      try {
        const result = await poolModule.checkKey(key.id);
        checked++;
        if (result.healthStatus === 'healthy') healthy++;
        else unhealthy++;
      } catch (e) {
        console.error(`[AUTO-HEALTH-CHECK] Error checking key ${key.id}:`, e.message);
      }
    }
    console.log(`[AUTO-HEALTH-CHECK] Completed: ${checked} checked, ${healthy} healthy, ${unhealthy} unhealthy`);
  } catch (error) {
    console.error('[AUTO-HEALTH-CHECK] Scheduler error:', error.message);
  }
}, 6 * 60 * 60 * 1000); // 6 hours

// Run initial health check on startup for keys not checked in last 24 hours
(async () => {
  try {
    const { query } = require('./src/db');
    const staleKeys = await query("SELECT id FROM api_keys WHERE last_checked_at IS NULL OR last_checked_at < now() - interval '24 hours'");
    if (staleKeys.rows.length > 0) {
      console.log(`[STARTUP-HEALTH-CHECK] Found ${staleKeys.rows.length} stale keys, checking...`);
      for (const row of staleKeys.rows) {
        try {
          await poolModule.checkKey(row.id);
        } catch (e) {
          console.error(`[STARTUP-HEALTH-CHECK] Error checking key ${row.id}:`, e.message);
        }
      }
      console.log('[STARTUP-HEALTH-CHECK] Completed');
    }
  } catch (error) {
    console.error('[STARTUP-HEALTH-CHECK] Error:', error.message);
  }
})();

// Schedule automated database backups
dbBackup.scheduleBackups();

app.use((err, req, res, next) => {
  console.error('Unhandled route error:', err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

const httpServer = app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
generation.loadCosts().catch(error => console.error('Unable to preload model costs:', error.message));
setInterval(() => {
  generation.loadCosts().catch(error => console.error('Unable to refresh model costs:', error.message));
}, config.CREDIT_REFRESH_INTERVAL_MS);

// Keep abandoned QR transactions from accumulating in the payment ledger.
setInterval(() => {
  payments.expirePendingPayments().catch(error => console.error('Unable to expire pending payments:', error.message));
}, 5 * 60 * 1000);

// Orphan detection endpoint
app.get('/api/admin/storage/orphans', auth.adminMiddleware, async (req, res) => {
  const { query } = require('./src/db');
  try {
    const { rows } = await query("SELECT task_id, result->>'localUrl' as url, result->>'storagePath' as storage FROM image_results");
    const orphans = [];
    const missingFiles = [];
    
    for (const row of rows) {
      // Check if DB record has no file reference
      if (!row.url && !row.storage) {
        orphans.push({ taskId: row.task_id, reason: 'no_file_reference' });
        continue;
      }
      
      // Check if referenced file exists
      if (row.url) {
        const filepath = path.join(publicDir, row.url.slice(1));
        if (!fs.existsSync(filepath)) {
          missingFiles.push({ taskId: row.task_id, path: row.url, reason: 'file_not_found' });
        }
      }
      
      if (row.storage && !fs.existsSync(row.storage)) {
        missingFiles.push({ taskId: row.task_id, path: row.storage, reason: 'storage_not_found' });
      }
    }
    
    res.json({ 
      orphans, 
      missingFiles,
      orphanCount: orphans.length, 
      missingFileCount: missingFiles.length,
      totalChecked: rows.length
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
