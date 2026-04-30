-- ============================================================
-- 003_xapi_migration.sql
-- Switch X integration from Playwright login (ToS-violating) to
-- the official X API V2 (Free tier) using OAuth 2.0 Bearer Token.
--
-- Adds new credential columns to `accounts`. The legacy
-- `x_password_enc` column is kept (made nullable) so a Playwright
-- fallback path can still run if explicitly enabled, and so this
-- migration is non-destructive.
--
-- This migration is idempotent — safe to run multiple times.
-- ============================================================

-- 1. Add new X API credential columns
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS x_bearer_token TEXT,
  ADD COLUMN IF NOT EXISTS x_api_key      TEXT,
  ADD COLUMN IF NOT EXISTS x_api_secret   TEXT,
  ADD COLUMN IF NOT EXISTS x_access_token        TEXT,
  ADD COLUMN IF NOT EXISTS x_access_token_secret TEXT;

-- 2. Make x_password_enc nullable. New accounts created via the
--    official X API path do not set a password; only the legacy
--    Playwright fallback path needs it.
ALTER TABLE accounts ALTER COLUMN x_password_enc DROP NOT NULL;

COMMENT ON COLUMN accounts.x_bearer_token IS
  'OAuth 2.0 Bearer Token for X API V2. Required when X_CLIENT=api.';
COMMENT ON COLUMN accounts.x_api_key IS
  'X API Consumer Key (optional, for OAuth 1.0a user-context posts).';
COMMENT ON COLUMN accounts.x_api_secret IS
  'X API Consumer Secret (optional, for OAuth 1.0a user-context posts).';
COMMENT ON COLUMN accounts.x_access_token IS
  'X API user Access Token (optional, for OAuth 1.0a user-context posts).';
COMMENT ON COLUMN accounts.x_access_token_secret IS
  'X API user Access Token Secret (optional, for OAuth 1.0a user-context posts).';
COMMENT ON COLUMN accounts.x_password_enc IS
  'DEPRECATED — only used by the legacy Playwright fallback (X_CLIENT=playwright). May be NULL.';
