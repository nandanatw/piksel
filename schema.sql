CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  telegram_id TEXT UNIQUE,
  telegram_username TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT ('user_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  display_name TEXT NOT NULL DEFAULT 'Kreator Kreasya',
  password_hash TEXT,
  unlimited BOOLEAN NOT NULL DEFAULT false,
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  total_credits INTEGER NOT NULL DEFAULT 0 CHECK (total_credits >= 0),
  signup_ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS unlimited BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS unlimited_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS free_grant_held BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS free_trial BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tos_accepted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
UPDATE users
SET display_name = COALESCE(
  NULLIF(trim(display_name), ''),
  NULLIF(trim(telegram_username), ''),
  NULLIF(trim(split_part(email, '@', 1)), ''),
  'Kreator Kreasya'
)
WHERE display_name IS NULL OR trim(display_name) = '';
UPDATE users SET display_name = 'Kreator Kreasya' WHERE char_length(trim(display_name)) < 2;
UPDATE users SET display_name = left(trim(display_name), 50) WHERE char_length(trim(display_name)) > 50;
UPDATE users
SET username = 'user_' || substr(md5(lower(email)), 1, 12)
WHERE username IS NULL OR trim(username) = '';
ALTER TABLE users ALTER COLUMN username SET DEFAULT ('user_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12));
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ALTER COLUMN display_name SET DEFAULT 'Kreator Kreasya';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_format_check;
ALTER TABLE users ADD CONSTRAINT users_username_format_check CHECK (username ~ '^[a-z0-9_]{3,24}$');
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_display_name_length_check;
ALTER TABLE users ADD CONSTRAINT users_display_name_length_check CHECK (char_length(trim(display_name)) BETWEEN 2 AND 50);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users (lower(username));
CREATE INDEX IF NOT EXISTS users_email_domain_created_idx ON users ((lower(split_part(email, '@', 2))), created_at DESC);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL DEFAULT '',
  time TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_email_time_idx ON transactions(email, time DESC);
CREATE INDEX IF NOT EXISTS users_signup_ip_idx ON users(signup_ip);

CREATE TABLE IF NOT EXISTS payment_events (
  order_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0,
  exhausted BOOLEAN NOT NULL DEFAULT false,
  exhausted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_available_idx ON api_keys(exhausted, balance DESC);
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS health_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS health_message TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS image_tasks (
  task_id TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  status TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  ratio TEXT,
  resolution TEXT,
  cost INTEGER NOT NULL DEFAULT 0,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS image_tasks_email_created_idx ON image_tasks(email, created_at DESC);
CREATE INDEX IF NOT EXISTS image_tasks_status_idx ON image_tasks(status, created_at);
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS retry_of TEXT;
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
-- Community remix attribution only. This metadata is never forwarded to the
-- image provider and does not change generation parameters.
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS remix_parent_task_id TEXT;
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS provider_task_id TEXT;
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS provider_key_id BIGINT;
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS provider_cancel_requested_at TIMESTAMPTZ;
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS provider_cancelled_at TIMESTAMPTZ;
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS provider_cancel_error TEXT;
-- Presentation/storage grouping only. A batch never changes provider task
-- creation, moderation, charging, retries, or API-key selection.
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS batch_position INTEGER;
CREATE INDEX IF NOT EXISTS image_tasks_queue_idx ON image_tasks(status, created_at, task_id);
CREATE INDEX IF NOT EXISTS image_tasks_remix_parent_idx ON image_tasks(remix_parent_task_id) WHERE remix_parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS image_tasks_provider_task_idx ON image_tasks(provider_task_id) WHERE provider_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS image_tasks_batch_idx ON image_tasks(batch_id, created_at) WHERE batch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS image_results (
  task_id TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE image_results ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;
ALTER TABLE image_results ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE image_results ADD COLUMN IF NOT EXISTS deleted_by TEXT;
ALTER TABLE image_results ADD COLUMN IF NOT EXISTS owner_deleted_at TIMESTAMPTZ;
ALTER TABLE image_results ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE image_results ADD COLUMN IF NOT EXISTS batch_position INTEGER;
-- Generated content is retained for administrative review after an account is removed.
ALTER TABLE image_results DROP CONSTRAINT IF EXISTS image_results_email_fkey;
ALTER TABLE image_tasks DROP CONSTRAINT IF EXISTS image_tasks_email_fkey;
CREATE INDEX IF NOT EXISTS image_results_deleted_idx ON image_results(deleted_at, created_at DESC);
CREATE INDEX IF NOT EXISTS image_results_batch_idx ON image_results(batch_id, created_at) WHERE batch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS image_references (
  id BIGSERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  owner_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  original_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  byte_size BIGINT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, position)
);
CREATE INDEX IF NOT EXISTS image_references_owner_created_idx ON image_references(owner_email, created_at DESC);
ALTER TABLE image_references ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE image_references ADD COLUMN IF NOT EXISTS deleted_by TEXT;
ALTER TABLE image_references ADD COLUMN IF NOT EXISTS thumbnail_path TEXT;
ALTER TABLE image_references ADD COLUMN IF NOT EXISTS batch_id TEXT;
-- User-library metadata only. These fields never change provider uploads or
-- reference ordering in an image-generation request.
ALTER TABLE image_references ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE image_references ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE image_references ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE image_references ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS image_references_deleted_idx ON image_references(deleted_at, created_at DESC);
CREATE INDEX IF NOT EXISTS image_references_library_idx ON image_references(owner_email, is_favorite DESC, last_used_at DESC, created_at DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS image_references_batch_position_idx ON image_references(batch_id, position) WHERE batch_id IS NOT NULL;
ALTER TABLE image_references DROP CONSTRAINT IF EXISTS image_references_owner_email_fkey;
ALTER TABLE image_references ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS image_references_content_hash_idx ON image_references(owner_email, content_hash) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS signup_batches (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'running',
  total INTEGER NOT NULL,
  threads INTEGER NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS signup_batch_items (
  id BIGSERIAL PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES signup_batches(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  thread_id INTEGER NOT NULL DEFAULT 0,
  email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  step TEXT NOT NULL DEFAULT '',
  balance INTEGER,
  error TEXT,
  api_key TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(batch_id, position)
);
CREATE INDEX IF NOT EXISTS signup_batch_items_batch_idx ON signup_batch_items(batch_id, position);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL DEFAULT 'admin',
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx ON admin_audit_log(action, created_at DESC);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_verification_tokens_email_idx ON email_verification_tokens(email, created_at DESC);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_email_idx ON password_reset_tokens(email, created_at DESC);
CREATE TABLE IF NOT EXISTS verification_email_log (
  id BIGSERIAL PRIMARY KEY,
  email_hash TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('register','resend')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_email_log_created_idx ON verification_email_log(created_at DESC);
ALTER TABLE verification_email_log DROP CONSTRAINT IF EXISTS verification_email_log_kind_check;
ALTER TABLE verification_email_log ADD CONSTRAINT verification_email_log_kind_check CHECK (kind IN ('register','resend','password_reset'));

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(bucket,key_hash)
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_window_idx ON auth_rate_limits(window_started_at);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS user_sessions_email_idx ON user_sessions(email, created_at DESC);
CREATE INDEX IF NOT EXISTS user_sessions_active_idx ON user_sessions(email, expires_at) WHERE revoked_at IS NULL;
-- Accounts predating persistent verification have no token history and remain usable.
UPDATE users u SET email_verified_at = u.created_at
WHERE u.email_verified_at IS NULL AND u.password_hash IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM email_verification_tokens t WHERE t.email = u.email);

CREATE TABLE IF NOT EXISTS payments (
  order_id TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  credits INTEGER NOT NULL CHECK (credits > 0),
  expected_amount INTEGER NOT NULL CHECK (expected_amount > 0),
  paid_amount INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT NOT NULL DEFAULT 'pakasir',
  provider_data JSONB NOT NULL DEFAULT '{}',
  product_type TEXT NOT NULL DEFAULT 'credits',
  plan_days INTEGER NOT NULL DEFAULT 0 CHECK (plan_days >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'credits';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS plan_days INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS payments_email_created_idx ON payments(email, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_status_created_idx ON payments(status, created_at DESC);

CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  archive_path TEXT,
  byte_size BIGINT,
  error TEXT,
  created_by TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS backup_runs_created_idx ON backup_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS users_created_idx ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS users_suspended_idx ON users(suspended_at) WHERE suspended_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS image_results_email_created_idx ON image_results(email, created_at DESC);

-- Add usage tracking and notes for API keys
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS success_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS error_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS api_keys_last_used_idx ON api_keys(last_used_at DESC);
CREATE INDEX IF NOT EXISTS api_keys_tags_idx ON api_keys USING GIN(tags);

-- User analytics, tags, and admin notes
ALTER TABLE users ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_generation_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_images INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ip INET;

CREATE INDEX IF NOT EXISTS users_tags_idx ON users USING GIN(tags);
CREATE INDEX IF NOT EXISTS users_last_generation_idx ON users(last_generation_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS users_total_images_idx ON users(total_images DESC);

-- User activity log for security and audit
CREATE TABLE IF NOT EXISTS user_activity_log (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  action TEXT NOT NULL,
  ip INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Audit history must survive account deletion and may include unknown/blocked identities.
ALTER TABLE user_activity_log DROP CONSTRAINT IF EXISTS user_activity_log_email_fkey;
ALTER TABLE user_activity_log ALTER COLUMN email DROP NOT NULL;
CREATE INDEX IF NOT EXISTS user_activity_log_email_idx ON user_activity_log(email, created_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_log_action_idx ON user_activity_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_log_ip_idx ON user_activity_log(ip);

-- Keep denormalized user generation counters accurate for every insert/delete path.
CREATE OR REPLACE FUNCTION sync_user_image_counters() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users SET total_images=COALESCE(total_images,0)+1,
      last_generation_at=GREATEST(COALESCE(last_generation_at,NEW.created_at),NEW.created_at)
    WHERE email=NEW.email;
    RETURN NEW;
  END IF;
  UPDATE users SET total_images=GREATEST(COALESCE(total_images,0)-1,0),
    last_generation_at=(SELECT max(created_at) FROM image_results WHERE email=OLD.email)
  WHERE email=OLD.email;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS image_results_user_counters ON image_results;
CREATE TRIGGER image_results_user_counters AFTER INSERT OR DELETE ON image_results
FOR EACH ROW EXECUTE FUNCTION sync_user_image_counters();

UPDATE users u SET
  total_images=(SELECT count(*) FROM image_results r WHERE r.email=u.email),
  last_generation_at=(SELECT max(created_at) FROM image_results r WHERE r.email=u.email);

-- Backfill terminal generation events so historical admin activity is complete.
INSERT INTO user_activity_log(email,action,metadata,created_at)
SELECT t.email,
  CASE t.status WHEN 'done' THEN 'generation.completed' WHEN 'cancelled' THEN 'generation.cancelled' ELSE 'generation.failed' END,
  jsonb_build_object('taskId',t.task_id,'model',t.model,'cost',t.cost,'backfilled',true),
  COALESCE(t.finished_at,t.created_at)
FROM image_tasks t JOIN users u ON u.email=t.email
WHERE t.status IN ('done','error','cancelled')
  AND NOT EXISTS (SELECT 1 FROM user_activity_log a WHERE a.action LIKE 'generation.%' AND a.metadata->>'taskId'=t.task_id);

-- Blocked IPs
CREATE TABLE IF NOT EXISTS blocked_ips (
  ip INET PRIMARY KEY,
  reason TEXT,
  blocked_by TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Queue tracking and analytics
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS queue_position INTEGER;
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS estimated_completion TIMESTAMPTZ;
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS actual_completion TIMESTAMPTZ;
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS processing_duration INTEGER; -- seconds

UPDATE image_tasks SET
  actual_completion=COALESCE(actual_completion,finished_at),
  processing_duration=COALESCE(processing_duration,GREATEST(0,EXTRACT(EPOCH FROM (finished_at-COALESCE(started_at,created_at)))::int))
WHERE finished_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS image_tasks_queue_position_idx ON image_tasks(queue_position) WHERE queue_position IS NOT NULL;

-- Queue statistics for analytics
CREATE TABLE IF NOT EXISTS queue_stats (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  queued_count INTEGER NOT NULL DEFAULT 0,
  active_count INTEGER NOT NULL DEFAULT 0,
  avg_wait_time INTEGER, -- seconds
  avg_processing_time INTEGER, -- seconds
  success_count_today INTEGER DEFAULT 0,
  failure_count_today INTEGER DEFAULT 0,
  cancelled_count_today INTEGER DEFAULT 0,
  total_processed_today INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS queue_stats_timestamp_idx ON queue_stats(timestamp DESC);

-- Community posts are presentation metadata layered on top of an existing
-- public result. They do not alter generation inputs or stored image output.
CREATE TABLE IF NOT EXISTS public_posts (
  task_id TEXT PRIMARY KEY REFERENCES image_results(task_id) ON DELETE CASCADE,
  owner_email TEXT NOT NULL,
  creator_name TEXT NOT NULL DEFAULT 'Kreator Kreasya',
  caption TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  show_prompt BOOLEAN NOT NULL DEFAULT true,
  allow_prompt_copy BOOLEAN NOT NULL DEFAULT true,
  allow_remix BOOLEAN NOT NULL DEFAULT false,
  remix_parent_task_id TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public_posts ADD COLUMN IF NOT EXISTS creator_name TEXT NOT NULL DEFAULT 'Kreator Kreasya';
ALTER TABLE public_posts ADD COLUMN IF NOT EXISTS show_prompt BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public_posts ADD COLUMN IF NOT EXISTS allow_prompt_copy BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public_posts ADD COLUMN IF NOT EXISTS allow_remix BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public_posts ADD COLUMN IF NOT EXISTS remix_parent_task_id TEXT;
CREATE INDEX IF NOT EXISTS public_posts_published_idx ON public_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS public_posts_remix_parent_idx ON public_posts(remix_parent_task_id) WHERE remix_parent_task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public_post_likes (
  task_id TEXT NOT NULL REFERENCES public_posts(task_id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(task_id, email)
);
CREATE INDEX IF NOT EXISTS public_post_likes_email_idx ON public_post_likes(email, created_at DESC);

CREATE TABLE IF NOT EXISTS public_post_saves (
  task_id TEXT NOT NULL REFERENCES public_posts(task_id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(task_id, email)
);
CREATE INDEX IF NOT EXISTS public_post_saves_email_idx ON public_post_saves(email, created_at DESC);

CREATE TABLE IF NOT EXISTS public_post_reports (
  task_id TEXT NOT NULL REFERENCES public_posts(task_id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'other',
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(task_id, email)
);
CREATE INDEX IF NOT EXISTS public_post_reports_status_idx ON public_post_reports(status, created_at DESC);

-- Revocable, expiring access to exactly one private result per token.
CREATE TABLE IF NOT EXISTS result_shares (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  task_id TEXT NOT NULL REFERENCES image_results(task_id) ON DELETE CASCADE,
  owner_email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  allow_download BOOLEAN NOT NULL DEFAULT false,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS result_shares_owner_idx ON result_shares(owner_email, created_at DESC);
CREATE INDEX IF NOT EXISTS result_shares_task_idx ON result_shares(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS result_shares_active_idx ON result_shares(expires_at) WHERE revoked_at IS NULL;

-- Preserve the current Explore catalog when this schema is first introduced.
INSERT INTO public_posts(task_id, owner_email, published_at)
SELECT task_id, email, created_at
FROM image_results
WHERE deleted_at IS NULL AND result->>'isPublic' = 'true'
ON CONFLICT (task_id) DO NOTHING;

-- Queue configuration (pause/resume, limits)
CREATE TABLE IF NOT EXISTS queue_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  paused BOOLEAN NOT NULL DEFAULT false,
  max_concurrent INTEGER NOT NULL DEFAULT 4,
  max_queued INTEGER NOT NULL DEFAULT 100,
  auto_retry_failed BOOLEAN NOT NULL DEFAULT false,
  auto_cancel_old_minutes INTEGER DEFAULT 30,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1) -- Only one row allowed
);
INSERT INTO queue_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Plans (subscription packages)
CREATE TABLE IF NOT EXISTS plans (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  duration_days INTEGER NOT NULL CHECK (duration_days >= 1),
  price_idr INTEGER NOT NULL CHECK (price_idr >= 0),
  compare_at_idr INTEGER DEFAULT NULL,
  badge TEXT DEFAULT NULL,
  description TEXT NOT NULL DEFAULT '',
  features TEXT[] NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO plans (slug, name, duration_days, price_idr, compare_at_idr, badge, description, features, sort_order)
VALUES
  ('unlimited_1d', 'Unlimited 1 hari', 1, 15000, 30000, 'Coba dulu', 'Generate tanpa batas selama 1 hari.', ARRAY['Akses semua model', 'QRIS terverifikasi otomatis', 'Cocok buat coba-coba'], 1),
  ('unlimited_3d', 'Unlimited 3 hari', 3, 29000, 59000, 'Best value', 'Generate tanpa batas selama 3 hari.', ARRAY['Akses semua model', 'QRIS terverifikasi otomatis', 'Hemat buat project kecil'], 2),
  ('unlimited_7d', 'Unlimited 7 hari', 7, 59000, 199000, 'Image offer', 'Generate tanpa batas selama 7 hari.', ARRAY['Akses semua model', 'QRIS terverifikasi otomatis', 'Khusus generate image'], 3),
  ('unlimited_30d', 'Unlimited 30 hari', 30, 100000, 599000, 'Limited offer', 'Generate tanpa batas selama 30 hari.', ARRAY['Akses semua model', 'QRIS terverifikasi otomatis', 'Berlaku untuk semua model'], 4)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  duration_days = EXCLUDED.duration_days,
  price_idr = EXCLUDED.price_idr,
  compare_at_idr = EXCLUDED.compare_at_idr,
  badge = EXCLUDED.badge,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Prompt history (sync across devices, per user)
CREATE TABLE IF NOT EXISTS prompt_history (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  task_id TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prompt_history_email_idx ON prompt_history(email, created_at DESC);

-- Albums (user collections)
CREATE TABLE IF NOT EXISTS albums (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS albums_email_idx ON albums(email, created_at DESC);

CREATE TABLE IF NOT EXISTS album_items (
  id SERIAL PRIMARY KEY,
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(album_id, task_id)
);
CREATE INDEX IF NOT EXISTS album_items_album_idx ON album_items(album_id, sort_order);

-- Vouchers (redeem codes)
CREATE TABLE IF NOT EXISTS vouchers (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  plan_slug TEXT NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 30,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vouchers_code_idx ON vouchers(code);
