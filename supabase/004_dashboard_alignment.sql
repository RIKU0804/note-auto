-- ============================================================
-- 004_dashboard_alignment.sql
-- Align the database with the dashboard / worker contracts.
--
-- Adds columns that the application code expects but were missing
-- from 001/002/003, tightens CHECK constraints, and relaxes the
-- posts.account_id FK so accounts can be hard-deleted without
-- breaking historical post rows.
--
-- This migration is idempotent — safe to run multiple times.
-- ============================================================

-- 1. accounts.post_interval_minutes — minimum gap (minutes) between
--    consecutive posts on the same account. Used by the Python worker
--    to space out account-level retries within a cycle.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS post_interval_minutes INT NOT NULL DEFAULT 15;

-- 2. users.discord_user_id — opaque Discord ID for future @-mentions.
--    Optional, currently surfaced read-only via /api/settings.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS discord_user_id TEXT;

-- 3. logs.level CHECK — the worker writes 'info'|'warning'|'error'.
--    Lock that down at the database level so a typo cannot poison
--    the dashboard's level filter.
ALTER TABLE logs DROP CONSTRAINT IF EXISTS logs_level_check;
ALTER TABLE logs
  ADD CONSTRAINT logs_level_check
  CHECK (level IN ('info', 'warning', 'error'));

-- 4. posts.cycle CHECK — only 'morning' or 'night' are meaningful.
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_cycle_check;
ALTER TABLE posts
  ADD CONSTRAINT posts_cycle_check
  CHECK (cycle IN ('morning', 'night'));

-- 5. posts.status CHECK — keep the enum honest.
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_status_check;
ALTER TABLE posts
  ADD CONSTRAINT posts_status_check
  CHECK (status IN ('queued', 'posted', 'failed'));

-- 6. users.plan CHECK — guard against accidental free-text plans.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
ALTER TABLE users
  ADD CONSTRAINT users_plan_check
  CHECK (plan IN ('free', 'pro', 'business'));

-- 7. posts.account_id — switch FK action to ON DELETE SET NULL so an
--    account can be hard-deleted without losing posting history.
DO $$
DECLARE
  conname TEXT;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'posts'
    AND c.contype = 'f'
    AND pg_get_constraintdef(c.oid) ILIKE '%REFERENCES accounts(id)%';

  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE posts DROP CONSTRAINT %I', conname);
  END IF;

  ALTER TABLE posts
    ADD CONSTRAINT posts_account_id_fkey
    FOREIGN KEY (account_id)
    REFERENCES accounts(id)
    ON DELETE SET NULL;
END $$;

-- 8. Helpful indexes for the dashboard's "today" queries.
CREATE INDEX IF NOT EXISTS idx_posts_user_created
  ON posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_account_cycle
  ON posts (account_id, cycle);
