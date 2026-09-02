const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');
const ALLOWED_KEYS = new Set();

let cache = {};
let history = [];
let hydrated = false;

function ensureDir() {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  ensureDir();
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (_) {
      cache = {};
    }
  }
}

function save() {
  ensureDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(cache, null, 2));
}

function hydrate() {
  if (hydrated) return;
  load();
  hydrated = true;
}

function publicSettings() {
  return { ...cache };
}

function getSettingsMetadata() {
  return { keys: [...ALLOWED_KEYS] };
}

function setMany(values, _meta) {
  const changes = [];
  for (const [key, value] of Object.entries(values || {})) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (cache[key] !== value) {
      changes.push({ key, from: cache[key], to: value });
      cache[key] = value;
      history.push({ key, value, at: new Date().toISOString() });
    }
  }
  if (changes.length) save();
  return changes;
}

function getHistory(limit = 50) {
  return history.slice(-limit).reverse();
}

function exportSettings() {
  return { ...cache };
}

function importSettings(values, _meta) {
  return setMany(values, _meta);
}

module.exports = {
  ALLOWED: ALLOWED_KEYS,
  hydrate,
  publicSettings,
  getSettingsMetadata,
  setMany,
  getHistory,
  exportSettings,
  importSettings,
};
