-- ============================================================
-- 001_initial_schema.sql
-- X auto-posting SaaS — initial database schema
-- ============================================================

-- ============================================================
-- 1. TABLES
-- ============================================================

-- 1-1. users
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'free',              -- "free"|"pro"|"business"
  discord_webhook_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1-2. accounts — X accounts belonging to a user
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  genre_id TEXT NOT NULL,
  x_username TEXT NOT NULL,
  x_password_enc TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1-3. posts — generated and posted tweets
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id),
  cycle TEXT NOT NULL,                   -- "morning"|"night"
  tweet_text TEXT NOT NULL,
  x_tweet_id TEXT,
  status TEXT DEFAULT 'queued',          -- "queued"|"posted"|"failed"
  error_message TEXT,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1-4. research — scraped trending tweets
CREATE TABLE research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id),
  cycle TEXT NOT NULL,
  tweet_id TEXT,
  tweet_text TEXT NOT NULL,
  likes INT DEFAULT 0,
  retweets INT DEFAULT 0,
  collected_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, tweet_id)
);

-- 1-5. logs
CREATE TABLE logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID,
  level TEXT NOT NULL,                   -- "info"|"warning"|"error"
  module TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1-6. plan_limits
CREATE TABLE plan_limits (
  plan TEXT PRIMARY KEY,
  max_accounts INT NOT NULL,
  cycles_per_day INT NOT NULL,
  price_jpy INT NOT NULL
);

INSERT INTO plan_limits VALUES
  ('free',     1,  1, 0),
  ('pro',      3,  2, 2980),
  ('business', 10, 2, 9800);

-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE INDEX idx_accounts_user_id  ON accounts (user_id);
CREATE INDEX idx_posts_user_id     ON posts    (user_id);
CREATE INDEX idx_posts_account_id  ON posts    (account_id);
CREATE INDEX idx_posts_status      ON posts    (status);
CREATE INDEX idx_posts_created_at  ON posts    (created_at);
CREATE INDEX idx_research_user_id  ON research (user_id);
CREATE INDEX idx_logs_user_id      ON logs     (user_id);
CREATE INDEX idx_logs_created_at   ON logs     (created_at);

-- ============================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE research    ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "accounts_select_own" ON accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "accounts_insert_own" ON accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "accounts_update_own" ON accounts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "accounts_delete_own" ON accounts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "posts_select_own" ON posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "posts_insert_own" ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "posts_update_own" ON posts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "posts_delete_own" ON posts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "research_select_own" ON research FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "research_insert_own" ON research FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "logs_select_own" ON logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "logs_insert_own" ON logs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "plan_limits_select_all" ON plan_limits FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- 4. TRIGGER — auto-create users row on signup
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email) VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
