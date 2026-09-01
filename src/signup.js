const fs = require('fs');
const imaps = require('imap-simple');
const puppeteer = require('puppeteer');
const { config, RANDOM_NAMES } = require('./config');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function randomName() { return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)]; }

function generateEmail() { return randomName() + Math.floor(Math.random() * 9999) + '@' + config.DOMAIN; }

async function getOTP(email, maxWait = 120000) {
  if (!config.GMAIL_USER || !config.GMAIL_APP_PASSWORD) throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be configured for auto-signup');
  const imapConfig = { imap: { user: config.GMAIL_USER, password: config.GMAIL_APP_PASSWORD, host: 'imap.gmail.com', port: 993, tls: true, tlsOptions: { rejectUnauthorized: false }, authTimeout: 30000 } };
  const conn = await imaps.connect(imapConfig);
  await conn.openBox('INBOX');
  const start = Date.now(); let lastUID = 0;
  while (Date.now() - start < maxWait) {
    const results = await conn.search(['UNSEEN', ['TO', email]], { bodies: ['TEXT'], markSeen: false });
    for (const msg of results) {
      if (msg.attributes.uid <= lastUID) continue;
      lastUID = msg.attributes.uid;
      let body = '';
      for (const p of msg.parts) { if (p.which === 'TEXT') body += p.body; }
      const m = body.match(/\b(\d{4,6})\b/);
      if (m) { conn.end(); return m[1]; }
    }
    await sleep(3000);
  }
  conn.end(); return null;
}

async function signupFull(email, keyName, onProgress) {
  const report = (step) => { if (onProgress) onProgress(step); };
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-ipv6'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  try {
    report('navigate');
    await page.goto('https://renoise.ai', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);
    const signupBtn = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('button, a')).find(e => /sign.?up|get.?started|start.?free|create.?account/i.test(e.textContent) && !/log.?in/i.test(e.textContent) && e.offsetParent !== null);
      return el ? el.textContent.trim() : null;
    });
    if (!signupBtn) throw new Error('No signup button');
    await page.evaluate(t => { const el = Array.from(document.querySelectorAll('button, a')).find(e => e.textContent.trim() === t && e.offsetParent !== null); if (el) el.click(); }, signupBtn);
    await sleep(3000);
    report('form');
    await page.waitForSelector('input[type="email"]', { visible: true, timeout: 30000 });
    await page.click('input[type="email"]');
    await page.keyboard.type(email, { delay: 30 });
    await sleep(500);
    const sendBtn = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('button')).find(b => /send|continue|next|submit|verify/i.test(b.textContent) && !/google|facebook|apple|github/i.test(b.textContent) && b.offsetParent !== null);
      return el ? el.textContent.trim() : null;
    });
    if (sendBtn) { await page.evaluate(t => { const el = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === t); if (el) el.click(); }, sendBtn); }
    else { await page.keyboard.press('Enter'); }
    report('otp_wait');
    const otp = await getOTP(email);
    if (!otp) throw new Error('No OTP');
    report('otp_verify');
    await page.click('input[type="text"]');
    await page.keyboard.type(otp, { delay: 50 });
    await sleep(500);
    const verifyBtn = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('button')).find(b => /verify|confirm|submit|continue|done/i.test(b.textContent) && !/google|facebook|apple|github/i.test(b.textContent) && b.offsetParent !== null);
      return el ? el.textContent.trim() : null;
    });
    if (verifyBtn) { await page.evaluate(t => { const el = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === t); if (el) el.click(); }, verifyBtn); }
    else { await page.keyboard.press('Enter'); }
    await sleep(4000);
    const cookies = await page.cookies();
    fs.writeFileSync(config.SESSION_FILE, JSON.stringify(cookies, null, 2));
    report('apikey');
    await page.goto('https://renoise.ai/developer', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);
    await page.evaluate(() => { const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Create'); if (btn) btn.click(); });
    await sleep(2000);
    await page.evaluate(name => { const el = document.querySelector('input[type="text"]'); if (el) { el.focus(); el.value = name; el.dispatchEvent(new Event('input', { bubbles: true })); } }, keyName);
    await sleep(300);
    await page.keyboard.press('Enter');
    await sleep(3000);
    let apiKey = null;
    page.on('response', async resp => { if (resp.url().includes('api/me/api-keys') && resp.status() === 201) { try { const d = await resp.json(); if (d.key) apiKey = d.key; } catch (e) {} } });
    await sleep(2000);
    if (!apiKey) { apiKey = await page.evaluate(() => { const m = document.body.innerText.match(/fk_[a-zA-Z0-9]{20,}/); return m ? m[0] : null; }); }
    if (!apiKey) throw new Error('API key not found');
    return apiKey;
  } finally { await browser.close(); }
}

module.exports = { signupFull, getOTP, generateEmail, sleep };
