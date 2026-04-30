-- ============================================================
-- 002_remove_note.sql
-- Drop legacy note.com columns from existing databases.
--
-- The project no longer integrates with note.com. New databases
-- created from 001_initial_schema.sql do not have these columns,
-- so this migration is idempotent and only needs to run on
-- pre-existing deployments.
-- ============================================================

ALTER TABLE accounts DROP COLUMN IF EXISTS note_email;
ALTER TABLE accounts DROP COLUMN IF EXISTS note_password_enc;

-- Posts table: legacy schema versions had note-specific columns.
ALTER TABLE posts DROP COLUMN IF EXISTS title;
ALTER TABLE posts DROP COLUMN IF EXISTS content_free;
ALTER TABLE posts DROP COLUMN IF EXISTS content_paid;
ALTER TABLE posts DROP COLUMN IF EXISTS note_price;
ALTER TABLE posts DROP COLUMN IF EXISTS note_url;
