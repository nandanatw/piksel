const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { issueUserSession, authCookie } = require('./auth');
const { ensureTelegramUser, getUser } = require('./credits');

function telegramConfig(req) {
  const botUsername = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
  const clientId = String(process.env.TELEGRAM_CLIENT_ID || '');
  const redirectUri = String(process.env.TELEGRAM_REDIRECT_URI || `${process.env.BASE_URL || 'https://app.kreasya.click'}/api/auth/telegram/callback`);
  const oidc = Boolean(clientId && process.env.TELEGRAM_CLIENT_SECRET);
  return { botUsername, clientId, redirectUri, oidc };
}

async function verifyTelegramOidc(idToken, clientId) {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded?.header?.kid || !clientId) throw new Error('Invalid Telegram OpenID configuration');
  const keys = await (await fetch('https://oauth.telegram.org/.well-known/jwks.json')).json();
  const jwk = keys.keys?.find(key => key.kid === decoded.header.kid);
  if (!jwk) throw new Error('Unknown Telegram signing key');
  return jwt.verify(idToken, crypto.createPublicKey({ key: jwk, format: 'jwk' }), { algorithms: ['RS256'], issuer: 'https://oauth.telegram.org', audience: clientId });
}

async function handleTelegramLogin(req, res) {
  const payload = req.method === 'GET' ? req.query : req.body;
  const isRedirectLogin = req.method === 'GET';
  if (payload?.id_token) {
    try {
      const clientId = String(process.env.TELEGRAM_CLIENT_ID || '');
      const verified = await verifyTelegramOidc(payload.id_token, clientId);
      const id = verified.sub || verified.id;
      if (!id) return res.status(401).json({ error: 'Telegram identity missing' });
      const displayName = verified.name || verified.preferred_username || 'Telegram User';
      const user = await ensureTelegramUser(id, { username: verified.preferred_username, displayName }, req.ip || req.connection.remoteAddress);
      if (!user) return res.status(403).json({ error: 'Free account limit reached for this IP' });
      await issueUserSession(req, res, user, { name: displayName, telegramId: String(id) });
      return res.json({ ok: true, email: user.email, name: displayName });
    } catch (error) { return res.status(401).json({ error: 'Invalid Telegram login token' }); }
  }
  const { id, first_name, last_name, username, photo_url, auth_date, hash } = payload;
  if (!id || !hash) return res.status(400).json({ error: 'Missing data' });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return res.status(500).json({ error: 'Bot not configured' });
  const authAge = Math.floor(Date.now() / 1000) - Number(auth_date);
  const maxAge = Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS || 300);
  if (!Number.isFinite(authAge) || authAge < 0 || authAge > maxAge) return res.status(401).json({ error: 'Telegram login expired' });

  const dataCheck = Object.keys(payload)
    .filter(k => k !== 'hash')
    .sort()
    .map(k => k + '=' + req.body[k])
    .join('\n');

  const secret = crypto.createHash('sha256').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');

  if (computedHash !== hash) return res.status(401).json({ error: 'Invalid hash' });

  const displayName = [first_name, last_name].filter(Boolean).join(' ') || 'Telegram User';
  const ip = req.ip || req.connection.remoteAddress;
  const user = await ensureTelegramUser(id, { username, displayName, photoUrl: photo_url }, ip);
  if (!user) return res.status(403).json({ error: 'Free account limit reached for this IP' });

  await issueUserSession(req, res, user, { name: displayName, telegramId: String(id) });
  if (isRedirectLogin) return res.redirect('/generate');
  res.json({ ok: true, email: user.email, name: displayName });
}

async function handleTelegramCallback(req, res) {
  const { code, error, state } = req.query;
  if (error) return res.redirect(`/?error=${encodeURIComponent(String(error))}`);
  const clientId = String(process.env.TELEGRAM_CLIENT_ID || '');
  const clientSecret = String(process.env.TELEGRAM_CLIENT_SECRET || '');
  const redirectUri = String(process.env.TELEGRAM_REDIRECT_URI || `${process.env.BASE_URL || 'https://app.kreasya.click'}/api/auth/telegram/callback`);
  if (!code || !clientId || !clientSecret) return res.redirect('/?error=telegram_config');
  const expectedState = req.cookies?.telegram_oauth_state;
  const verifier = req.cookies?.telegram_oauth_verifier;
  if (!state || !expectedState || !verifier || state.length !== expectedState.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))) return res.redirect('/?error=telegram_state');
  res.clearCookie('telegram_oauth_state');
  res.clearCookie('telegram_oauth_verifier');

  try {
    const tokenResponse = await fetch('https://oauth.telegram.org/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: String(code), redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier }).toString(),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.id_token) return res.redirect('/?error=telegram_token_exchange');
    const verified = await verifyTelegramOidc(tokens.id_token, clientId);
    const id = verified.sub || verified.id;
    const displayName = verified.name || verified.preferred_username || 'Telegram User';
    const user = await ensureTelegramUser(id, { username: verified.preferred_username, displayName }, req.ip || req.connection.remoteAddress);
    if (!user) return res.redirect('/?error=limit_reached');
    await issueUserSession(req, res, user, { name: displayName, telegramId: String(id) });
    res.redirect('/generate');
  } catch (error) {
    console.error('Telegram OIDC callback failed:', error.message);
    res.redirect('/?error=telegram_login_failed');
  }
}

function startTelegramLogin(req, res) {
  const clientId = String(process.env.TELEGRAM_CLIENT_ID || '');
  const clientSecret = String(process.env.TELEGRAM_CLIENT_SECRET || '');
  const redirectUri = String(process.env.TELEGRAM_REDIRECT_URI || `${process.env.BASE_URL || 'https://app.kreasya.click'}/api/auth/telegram/callback`);
  if (!clientId || !clientSecret) return res.status(503).json({ error: 'Telegram OIDC is not configured' });
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const cookie = authCookie(req);
  res.cookie('telegram_oauth_state', state, { ...cookie, maxAge: 10 * 60 * 1000 });
  res.cookie('telegram_oauth_verifier', verifier, { ...cookie, maxAge: 10 * 60 * 1000 });
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid profile', state, code_challenge: challenge, code_challenge_method: 'S256' });
  res.redirect(`https://oauth.telegram.org/auth?${params.toString()}`);
}

function handleTelegramConfig(req, res) {
  const { botUsername, clientId, redirectUri, oidc } = telegramConfig(req);
  if (!botUsername && !clientId) return res.status(503).json({ error: 'Telegram login is not configured' });
  res.json({ botUsername, clientId, redirectUri, oidc });
}

async function handleTelegramWebhook(req, res) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return res.status(500).json({ error: 'Bot not configured' });
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.get('x-telegram-bot-api-secret-token') !== secret) return res.status(401).json({ error: 'Invalid webhook secret' });

  const { message } = req.body;
  if (!message) return res.json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text || '';

  let reply = 'Welcome to Kreasya Bot!\n\nCommands:\n/balance - Check credits\n/generate <prompt> - Generate image\n/help - Show help';

  if (text === '/start') {
    const tgUser = message.from;
    const ip = req.ip;
    const user = await ensureTelegramUser(tgUser.id, { username: tgUser.username, displayName: tgUser.first_name || 'Telegram User' }, ip);
    reply = `Welcome ${tgUser.first_name || 'User'}! 🎨\n\nYour account: ${user?.email || 'unavailable'}\nCredits: ${user?.credits || 0} cr\n\n/balance - Check credits\n/generate <prompt> - Generate image`;
  } else if (text === '/balance') {
    const tgUser = message.from;
    const user = await getUser(`tg${tgUser.id}@telegram.user`);
    reply = `💰 Credits: ${user?.credits || 0} cr\n📊 Total topup: ${user?.totalCredits || 0} cr`;
  } else if (text === '/help') {
    reply = '🎨 Kreasya Bot\n\n/start - Register\n/balance - Check credits\n/generate <prompt> - Generate image (coming soon)';
  }

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: reply }),
    });
  } catch (e) {}

  res.json({ ok: true });
}

async function setupTelegramWebhook(req, res) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return res.status(400).json({ error: 'Bot token not set' });

  const baseUrl = process.env.BASE_URL || 'http://localhost:3456';
  const webhookUrl = baseUrl + '/api/telegram/webhook';

  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined }),
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = {
  handleTelegramLogin,
  handleTelegramCallback,
  startTelegramLogin,
  handleTelegramConfig,
  handleTelegramWebhook,
  setupTelegramWebhook,
};
