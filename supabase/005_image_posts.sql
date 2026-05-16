-- ============================================================
-- 005_image_posts.sql
-- Track AI-generated companion images on each post.
--
-- The worker now generates an image alongside the tweet text via the
-- OpenAI Images API and attaches it via the X v1.1 media/upload endpoint.
-- We persist:
--   * image_prompt — the exact prompt sent to the image model, useful
--     for debugging the worker and (eventually) for surfacing in the UI.
--   * has_image    — boolean flag set once the image is successfully
--     uploaded to X. Lets the dashboard render a chip without having to
--     re-fetch the tweet from X.
--
-- This migration is idempotent.
-- ============================================================

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS image_prompt TEXT;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS has_image BOOLEAN NOT NULL DEFAULT false;
