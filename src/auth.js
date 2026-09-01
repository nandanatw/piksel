const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { config } = require('./config');
const { query } = require('./db');

const magicTokens = new Map();
// A session stays alive while the account is actively using the app. The
// renewal is sliding, while the explicit revoke paths below remain intact.
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const SESSION_RENEW_THRESHOLD_SECONDS = 24 * 60 * 60;

function generateTOTP() {
  const secret = Buffer.from(config.TOTP_SECRET, 'base64');
  const time = Math.floor(Date.now() / 1000 / 30);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(time));
  const hmac = crypto.createHmac('sha1', secret).update(timeBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | (hmac[offset + 1] & 0xff) << 16 | (hmac[offset + 2] & 0xff) << 8 | (hmac[offset + 3] & 0xff)) % 1000000;
  return String(code).padStart(6, '0');
}

function verifyTOTP(code) {
  const expected = generateTOTP();
  if (code === expected) return true;
  const secret = Buffer.from(config.TOTP_SECRET, 'base64');
  const check = (offset) => {
    const t = Math.floor(Date.now() / 1000 / 30) + offset;
    const buf = Buffer.alloc(8); buf.writeBigInt64BE(BigInt(t));
    const h = crypto.createHmac('sha1', secret).update(buf).digest();
    const o = h[h.length - 1] & 0x0f;
    return String(((h[o] & 0x7f) << 24 | (h[o + 1] & 0xff) << 16 | (h[o + 2] & 0xff) << 8 | (h[o + 3] & 0xff)) % 1000000).padStart(6, '0');
  };
  return code === check(-1) || code === check(1);
}

function signJWT(payload) { return jwt.sign(payload, config.JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS }); }
function verifyJWT(token) { try { return jwt.verify(token, config.JWT_SECRET); } catch (e) { return null; } }

async function issueUserSession(req, res, user, extra = {}) {
  const sid = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await query(
    'INSERT INTO user_sessions(id,email,ip,user_agent,expires_at) VALUES($1,$2,$3,$4,$5)',
    [sid, user.email, req.ip || req.connection?.remoteAddress || null, req.get('user-agent') || null, expiresAt],
  );
  const token = signJWT({
    email: user.email,
    role: 'user',
    sessionVersion: Number(user.sessionVersion ?? user.session_version ?? 0),
    sid,
    ...extra,
  });
  res.cookie('token', token, authCookie(req));
  return token;
}

function authCookie(req) {
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0].trim();
  return { httpOnly: true, secure: config.NODE_ENV === 'production' || req.secure || forwardedProto === 'https', sameSite: 'lax', maxAge: SESSION_TTL_SECONDS * 1000 };
}

function refreshSessionCookie(req, res, user, cookieName) {
  const now = Math.floor(Date.now() / 1000);
  const remaining = Number(user?.exp || 0) - now;
  if (!user?.exp || remaining > SESSION_RENEW_THRESHOLD_SECONDS) return;

  // Do not copy JWT bookkeeping claims into the replacement token.
  const { iat, exp, ...payload } = user;
  res.cookie(cookieName, signJWT(payload), authCookie(req));
}

async function validateUserSession(req, res, user, next) {
  if (user.role === 'admin') {
    req.user = user;
    refreshSessionCookie(req, res, user, 'admintoken');
    return next();
  }
  const { rows } = await query('SELECT email,suspended_at,suspension_reason,session_version,email_verified_at FROM users WHERE email=$1', [user.email]);
  const current = rows[0];
  if (!current) return res.status(401).json({ error: 'Account not found' });
  if (current.suspended_at) return res.status(403).json({ error: current.suspension_reason || 'Account suspended', code: 'ACCOUNT_SUSPENDED' });
  if (Number(user.sessionVersion || 0) !== Number(current.session_version || 0)) return res.status(401).json({ error: 'Session revoked', code: 'SESSION_REVOKED' });
  if (user.sid) {
    const session = await query(
      'SELECT id,expires_at FROM user_sessions WHERE id=$1 AND email=$2 AND revoked_at IS NULL AND expires_at>now()',
      [user.sid, user.email],
    );
    if (!session.rows[0]) return res.status(401).json({ error: 'Session revoked', code: 'SESSION_REVOKED' });
    if (new Date(session.rows[0].expires_at).getTime() - Date.now() <= SESSION_RENEW_THRESHOLD_SECONDS * 1000) {
      await query("UPDATE user_sessions SET expires_at=now()+($2::int * interval '1 second') WHERE id=$1", [user.sid, SESSION_TTL_SECONDS]);
    }
    await query("UPDATE user_sessions SET last_seen_at=now() WHERE id=$1 AND last_seen_at<now()-interval '5 minutes'", [user.sid]);
    req.sessionId = user.sid;
  }
  req.user = user;
  req.currentUser = current;
  refreshSessionCookie(req, res, user, 'token');
  next();
}

async function revokeRequestSession(req) {
  const token = req.cookies?.token;
  const user = token ? verifyJWT(token) : null;
  if (user?.sid && user?.email) {
    await query('UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND email=$2', [user.sid, user.email]);
  }
  return user;
}

async function resolveTokenUser(token) {
  const user = token ? verifyJWT(token) : null;
  if (!user) return null;
  if (user.role === 'admin') return user;
  if (!user.email) return null;
  const current = await query('SELECT suspended_at,session_version FROM users WHERE email=$1', [user.email]);
  if (!current.rows[0] || current.rows[0].suspended_at) return null;
  if (Number(user.sessionVersion || 0) !== Number(current.rows[0].session_version || 0)) return null;
  if (user.sid) {
    const session = await query('SELECT 1 FROM user_sessions WHERE id=$1 AND email=$2 AND revoked_at IS NULL AND expires_at>now()', [user.sid, user.email]);
    if (!session.rows[0]) return null;
  }
  return user;
}

async function authMiddleware(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const user = verifyJWT(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  try { await validateUserSession(req, res, user, next); } catch (error) { next(error); }
}

function adminMiddleware(req, res, next) {
  const token = req.cookies?.admintoken || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const user = verifyJWT(token);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  req.user = user;
  refreshSessionCookie(req, res, user, 'admintoken');
  next();
}

async function anyAuthMiddleware(req, res, next) {
  // Check both cookies but prioritize based on role needed
  const userToken = req.cookies?.token;
  const adminToken = req.cookies?.admintoken;
  const headerToken = req.headers.authorization?.replace('Bearer ', '');
  
  const token = headerToken || userToken || adminToken;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  const user = verifyJWT(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  
  try { await validateUserSession(req, res, user, next); } catch (error) { next(error); }
}

async function sendMagicLink(email) {
  const token = crypto.randomBytes(32).toString('hex');
  magicTokens.set(token, { email, expires: Date.now() + 15 * 60 * 1000 });
  setTimeout(() => magicTokens.delete(token), 15 * 60 * 1000);

  const link = `${config.BASE_URL}/api/auth/verify?token=${token}`;
  const brevoKey = process.env.BREVO_API_KEY;

  if (brevoKey) {
    const Brevo = require('@getbrevo/brevo');
    const client = new Brevo.BrevoClient({ apiKey: brevoKey });
    await client.transactionalEmails.sendTransacEmail({
      sender: { email: process.env.BREVO_SENDER || 'noreply@Piksel.id' },
      to: [{ email }],
      subject: 'Piksel Gallery - Magic Link',
      htmlContent: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#1a1a2e;color:#eee;border-radius:12px">
        <h2 style="color:#a78bfa">Piksel Gallery</h2>
        <p>Click the button below to sign in:</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Sign In</a>
        <p style="color:#666;font-size:12px">Link expires in 15 minutes.</p></div>`,
    });
  } else {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    await transporter.sendMail({
      from: process.env.GMAIL_USER, to: email,
      subject: 'Piksel Gallery - Magic Link',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#1a1a2e;color:#eee;border-radius:12px">
        <h2 style="color:#a78bfa">Piksel Gallery</h2>
        <p>Click the button below to sign in:</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Sign In</a>
        <p style="color:#666;font-size:12px">Link expires in 15 minutes.</p></div>`,
    });
  }
}

async function sendVerificationEmail(email, token) {
  const link = `${config.BASE_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;
  const subject = 'Verify your Piksel account';
  const html = `<div style="font-family:sans-serif"><h2>Piksel</h2><p>Verify your email to finish registration.</p><a href="${link}">Verify email</a><p>This link expires in 30 minutes.</p></div>`;
  if (process.env.BREVO_API_KEY) {
    const Brevo = require('@getbrevo/brevo');
    const client = new Brevo.BrevoClient({ apiKey: process.env.BREVO_API_KEY });
    return client.transactionalEmails.sendTransacEmail({ sender: { email: process.env.BREVO_SENDER || 'noreply@Piksel.id' }, to: [{ email }], subject, htmlContent: html });
  }
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  return transporter.sendMail({ from: process.env.GMAIL_USER, to: email, subject, html });
}

async function sendPasswordResetEmail(email, token) {
  const baseUrl = String(process.env.PUBLIC_APP_URL || config.PUBLIC_APP_URL || config.BASE_URL).replace(/\/$/, '');
  const link = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const subject = 'Reset your Piksel password';
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px"><h2>Piksel</h2><p>Kami menerima permintaan untuk mengatur ulang kata sandi akunmu.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#36c9d3;color:#071014;border-radius:10px;text-decoration:none;font-weight:600">Atur ulang kata sandi</a></p><p>Link ini hanya dapat digunakan sekali dan kedaluwarsa dalam 30 menit.</p><p style="color:#666;font-size:12px">Abaikan email ini jika kamu tidak meminta reset password.</p></div>`;
  if (process.env.BREVO_API_KEY) {
    const Brevo = require('@getbrevo/brevo');
    const client = new Brevo.BrevoClient({ apiKey: process.env.BREVO_API_KEY });
    return client.transactionalEmails.sendTransacEmail({ sender: { email: process.env.BREVO_SENDER || 'noreply@Piksel.id' }, to: [{ email }], subject, htmlContent: html });
  }
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  return transporter.sendMail({ from: process.env.GMAIL_USER, to: email, subject, html });
}

module.exports = {
  ADMIN_PASSWORD: config.ADMIN_PASSWORD,
  generateTOTP,
  verifyTOTP,
  signJWT,
  verifyJWT,
  authMiddleware,
  adminMiddleware,
  anyAuthMiddleware,
  authCookie,
  issueUserSession,
  revokeRequestSession,
  resolveTokenUser,
  sendMagicLink,
  sendVerificationEmail,
  sendEmail: async (email, subject, body) => {
    if (process.env.BREVO_API_KEY) {
      const Brevo = require('@getbrevo/brevo');
      const client = new Brevo.BrevoClient({ apiKey: process.env.BREVO_API_KEY });
      return client.transactionalEmails.sendTransacEmail({ sender: { email: process.env.BREVO_SENDER || 'noreply@Piksel.id' }, to: [{ email }], subject, htmlContent: `<div style="font-family:sans-serif">${body}</div>` });
    }
    if (!process.env.GMAIL_USER) return;
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
    return transporter.sendMail({ from: process.env.GMAIL_USER, to: email, subject, html: `<div style="font-family:sans-serif">${body}</div>` });
  },
  sendPasswordResetEmail,
  magicTokens,
};
