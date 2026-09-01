const path = require('path');

const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3456),
  TRUST_PROXY: process.env.TRUST_PROXY !== 'false',
  BASE_URL: process.env.BASE_URL || 'http://localhost:3456',

  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret',
  TOTP_SECRET: process.env.TOTP_SECRET || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin',

  DATABASE_URL: process.env.DATABASE_URL || '',
  DATABASE_SSL: process.env.DATABASE_SSL !== 'false',
  DB_POOL_MAX: Number(process.env.DB_POOL_MAX || 20),

  GMAIL_USER: process.env.GMAIL_USER || '',
  GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD || '',
  DOMAIN: process.env.DOMAIN || 'dipayku.com',
  EMAIL_PREFIX: process.env.EMAIL_PREFIX || '',

  // Comma-separated allowed email domains for registration. Leave empty to allow all.
  // Example: "gmail.com,yahoo.com,outlook.com"
  ALLOWED_EMAIL_DOMAINS: process.env.ALLOWED_EMAIL_DOMAINS || '',
  // Comma-separated disposable or placeholder domains blocked during new registration.
  BLOCKED_EMAIL_DOMAINS: process.env.BLOCKED_EMAIL_DOMAINS || 'example.com,mailinator.com,10minutemail.com,temp-mail.org,yopmail.com,guerrillamail.com,sharklasers.com',

  FREE_CREDITS: parseInt(process.env.FREE_CREDITS || '12', 10),
  MAX_FREE_ACCOUNTS_PER_IP: parseInt(process.env.MAX_FREE_ACCOUNTS_PER_IP || '1', 10),
  MAX_FREE_ACCOUNTS_PER_EMAIL_DOMAIN: parseInt(process.env.MAX_FREE_ACCOUNTS_PER_EMAIL_DOMAIN || '1', 10),
  FREE_WATERMARK_ENABLED: process.env.FREE_WATERMARK_ENABLED !== 'false',
  FREE_WATERMARK_TEXT: process.env.FREE_WATERMARK_TEXT || 'Piksel\nhttps://piksel.my.id',
  CREDIT_PRICE_IDR: parseInt(process.env.CREDIT_PRICE_IDR || '1000', 10),
  UNLIMITED_30_PRICE_IDR: parseInt(process.env.UNLIMITED_30_PRICE_IDR || '100000', 10),
  UNLIMITED_30_COMPARE_AT_IDR: parseInt(process.env.UNLIMITED_30_COMPARE_AT_IDR || '599000', 10),
  UNLIMITED_7_PRICE_IDR: parseInt(process.env.UNLIMITED_7_PRICE_IDR || '59000', 10),
  UNLIMITED_7_COMPARE_AT_IDR: parseInt(process.env.UNLIMITED_7_COMPARE_AT_IDR || '199000', 10),
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || 'https://piksel.my.id',

  API_RATE_LIMIT_PER_MINUTE: Number(process.env.API_RATE_LIMIT_PER_MINUTE || 120),
  AUTH_RATE_LIMIT_PER_15_MINUTES: Number(process.env.AUTH_RATE_LIMIT_PER_15_MINUTES || 10),
  LOGIN_RATE_LIMIT_PER_15_MINUTES: Number(process.env.LOGIN_RATE_LIMIT_PER_15_MINUTES || 10),
  REGISTER_RATE_LIMIT_PER_HOUR: Number(process.env.REGISTER_RATE_LIMIT_PER_HOUR || 3),
  VERIFICATION_RATE_LIMIT_PER_HOUR: Number(process.env.VERIFICATION_RATE_LIMIT_PER_HOUR || 2),
  VERIFICATION_RESEND_COOLDOWN_SECONDS: Number(process.env.VERIFICATION_RESEND_COOLDOWN_SECONDS || 60),
  VERIFICATION_DAILY_EMAIL_LIMIT: Number(process.env.VERIFICATION_DAILY_EMAIL_LIMIT || 200),
  PASSWORD_RESET_RATE_LIMIT_PER_HOUR: Number(process.env.PASSWORD_RESET_RATE_LIMIT_PER_HOUR || 3),
  PASSWORD_RESET_SUBMIT_LIMIT_PER_15_MINUTES: Number(process.env.PASSWORD_RESET_SUBMIT_LIMIT_PER_15_MINUTES || 5),
  TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY || '',
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY || '',
  GENERATION_RATE_LIMIT_PER_MINUTE: Number(process.env.GENERATION_RATE_LIMIT_PER_MINUTE || 6),
  MAX_UPLOAD_BYTES: Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024),
  MAX_CONCURRENT_GENERATIONS: Number(process.env.MAX_CONCURRENT_GENERATIONS || 4),
  MAX_CONCURRENT_PER_KEY: Number(process.env.MAX_CONCURRENT_PER_KEY || 2),
  POOL_BALANCE_REFRESH_MS: Number(process.env.POOL_BALANCE_REFRESH_MS || 30000),
  MAX_KEY_RETRIES: Number(process.env.MAX_KEY_RETRIES || 6),
  GENERATION_TOTAL_TIMEOUT_MS: Number(process.env.GENERATION_TOTAL_TIMEOUT_MS || 720000),
  MAX_QUEUED_GENERATIONS: Number(process.env.MAX_QUEUED_GENERATIONS || 100),
  MAX_USER_GENERATIONS: Number(process.env.MAX_USER_GENERATIONS || 3),
  MAX_DAILY_GENERATIONS: Number(process.env.MAX_DAILY_GENERATIONS || 50),
  MAX_PAID_DAILY_GENERATIONS: Number(process.env.MAX_PAID_DAILY_GENERATIONS || 200),
  MAX_POOL_SIGNUP_COUNT: Number(process.env.MAX_POOL_SIGNUP_COUNT || 100),
  MAX_SIGNUP_THREADS: Number(process.env.MAX_SIGNUP_THREADS || 2),
  CREDIT_REFRESH_INTERVAL_MS: Number(process.env.CREDIT_REFRESH_INTERVAL_MS || 60000),

  MODAL_ENDPOINT_URL: process.env.MODAL_ENDPOINT_URL || 'https://piksel-image-gen--fastapi-app.modal.run',
  MODAL_API_KEY: process.env.MODAL_API_KEY || 'piksel-dev-key',
  SESSION_FILE: path.join(__dirname, '..', 'session.json'),
  PUBLIC_DIR: path.join(__dirname, '..', 'public'),
  STORAGE_DIR: process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage'),
};

const RANDOM_NAMES = [
  'alex','jordan','casey','morgan','riley','taylor','jamie','quinn',
  'blake','devin','sydney','drew','sam','charlie','reese','skyler',
  'max','logan','jesse','cameron','bailey','dakota','harley','kendall',
  'nova','luna','atlas','orion','phoenix','river','sage','wren',
  'kai','zen','fox','ash','onyx','storm','blaze','raven',
  'echo','ember','frost','shadow','iris','jade','ruby','opal',
  'ace','ryder','jax','kane','zeke','axel','dash','cruz',
  'maya','zara','aria','elara','kira','lyra','nyla','thea',
  'enzo','liam','noah','oliver','ethan','lucas','mason','levi',
  'ava','mia','zoe','ivy','ella','lily','rose','grace',
];

const IMAGE_MODELS = {
  'flux-dev': { name: 'Flux.1 Dev', supportsImageInput: true, resolutions: ['1k','2k','3k','4k'], ratios: ['1:1','4:3','3:4','16:9','9:16','3:2','2:3','21:9'], defaultRatio: '1:1', defaultRes: '1k' },
  'flux-schnell': { name: 'Flux.1 Schnell', supportsImageInput: true, resolutions: ['1k','2k','3k','4k'], ratios: ['1:1','4:3','3:4','16:9','9:16','3:2','2:3','21:9'], defaultRatio: '1:1', defaultRes: '1k' },
};

// Only these providers are currently safe for reference-image uploads.
const REFERENCE_IMAGE_MODELS = new Set(['flux-dev', 'flux-schnell']);

const FALLBACK_COSTS = {
  'flux-dev': 6,
  'flux-schnell': 3,
};

module.exports = { config, RANDOM_NAMES, IMAGE_MODELS, FALLBACK_COSTS, REFERENCE_IMAGE_MODELS };
