# CLAUDE.md -- Project Instructions

## 🚀 初回セットアップ（新規導入時はここから）

このプロジェクトを動かすには以下の4サービスのアカウントが必要です。
Claude Code に「セットアップして」と伝えれば、以下の手順を一緒に進められます。

### 必要なアカウント

| サービス | 用途 | URL |
|---------|------|-----|
| GitHub | コード管理 + 自動実行 (Actions) | https://github.com |
| Supabase | データベース | https://supabase.com |
| Vercel | ダッシュボード公開 | https://vercel.com |
| OpenRouter | AI API | https://openrouter.ai |

---

### Step 1 — リポジトリをフォーク

1. このリポジトリを自分の GitHub アカウントに Fork する
2. ローカルに clone する：
   ```bash
   git clone https://github.com/<あなたのユーザー名>/note-auto.git
   cd note-auto
   ```

---

### Step 2 — Supabase セットアップ

1. https://supabase.com でプロジェクトを新規作成
2. **SQL Editor** を開き `supabase/001_initial_schema.sql` の内容を貼り付けて実行
3. （旧バージョンからアップグレードする場合のみ）`supabase/002_remove_note.sql` を実行して
   note.com 関連の旧カラムを削除
4. **必須**: `supabase/003_xapi_migration.sql` を実行して X API V2 用の認証カラム
   （`x_bearer_token`, `x_api_key`, `x_api_secret`, `x_access_token`,
   `x_access_token_secret`）を追加する（Playwright→公式 API への切り替え）
5. **Project Settings → API** から以下をメモ：
   - `Project URL`（例: `https://xxxx.supabase.co`）
   - `service_role` キー（Secret欄にある長いJWT）

---

### Step 3 — OpenRouter セットアップ

1. https://openrouter.ai でアカウント作成
2. **Keys** ページで API キーを発行（`sk-or-v1-...`）
3. 使用モデルを決める（デフォルト推奨: `anthropic/claude-3-haiku`）

---

### Step 4 — GitHub Secrets を設定

フォークしたリポジトリの **Settings → Secrets and variables → Actions** で以下を追加：

| Secret 名 | 値 |
|---|---|
| `SUPABASE_URL` | Step 2 の Project URL |
| `SUPABASE_KEY` | Step 2 の service_role キー |
| `OPENROUTER_API_KEY` | Step 3 の API キー |
| `OPENROUTER_MODEL` | `anthropic/claude-3-haiku` |

または Claude Code 経由で設定する場合：
```bash
gh secret set SUPABASE_URL --body "https://xxxx.supabase.co"
gh secret set SUPABASE_KEY --body "eyJ..."
gh secret set OPENROUTER_API_KEY --body "sk-or-v1-..."
gh secret set OPENROUTER_MODEL --body "anthropic/claude-3-haiku"
```

---

### Step 5 — Vercel でダッシュボードをデプロイ

1. https://vercel.com で新規プロジェクトを作成
2. フォークしたリポジトリを連携
3. **Environment Variables** に以下を設定：
   - `NEXT_PUBLIC_SUPABASE_URL` = Step 2 の Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Supabase の `anon` キー
4. Deploy を実行 → 公開 URL が発行される

---

### Step 6 — 動作確認

GitHub Actions タブから手動実行で確認：
```bash
gh workflow run morning.yml
gh workflow run night.yml
```

ログが `completed success` になれば完了です。

---

## Project Overview

X 自動投稿 SaaS。X のトレンドを収集し、AI で投稿文を生成して朝・夜の2回自動ポストする。
複数アカウント対応。投稿完了・エラーを Discord に通知。

## Tech Stack

- **Dashboard**: Next.js 15 (App Router), React 19, Tailwind CSS 4, TypeScript
- **Database / Auth**: Supabase (PostgreSQL, Auth, RLS)
- **Worker**: Python 3.12, **tweepy (X API V2)**, GitHub Actions
- **AI**: OpenRouter (Claude 3 Haiku)
- **Hosting**: Vercel (dashboard), GitHub Actions (worker cron)

> **2026-04 重要変更**: X 連携を Playwright（ToS 違反・凍結リスク高）から
> 公式 X API V2（Free tier）に切り替えました。アカウントごとに
> Bearer Token を保存し、`tweepy` 経由で投稿・収集します。
> Playwright 実装は `X_CLIENT=playwright` で緊急フォールバックとしてのみ起動可。
> 通常運用では `X_CLIENT=api`（デフォルト）のままにしてください。

## Build & Dev Commands

```bash
npm run dev        # Start Next.js dev server on localhost:3000
npm run build      # Production build
```

## Directory Structure

### `src/` -- Next.js Dashboard (TypeScript)

ダッシュボード（Vercel ホスト）。ユーザー登録・Xアカウント設定・投稿履歴確認。

- `src/app/` -- App Router pages and API routes
- `src/lib/supabase/` -- Supabase client helpers

### `scripts/` -- Python Automation Worker

GitHub Actions cron で動く自動化エンジン。

- `scripts/worker.py` -- メインエントリーポイント。`--cycle morning|night` で実行
- `scripts/modules/`
  - `scraper.py` -- X トレンド収集 (X API V2 Recent Search) + AI トレンド分析
  - `generator.py` -- X 投稿文生成 (OpenRouter)
  - `x_poster.py` -- X へのツイート投稿 (X API V2 / tweepy、`X_CLIENT` で切替)
  - `discord_notify.py` -- Discord webhook 通知
  - `db.py` -- Supabase DB 操作
- `scripts/tests/` -- pytest / unittest 用（`tweepy` mock テストあり）
- `scripts/config/genres.json` -- ジャンル設定
- `scripts/requirements.txt` -- Python 依存関係

## Automation Flow (per cycle)

```
GitHub Actions cron
  → random delay (0-30 min, anti-freeze)
  → worker.py --cycle morning|night
      for each active account:
        1. scraper.run()   -- X トレンド収集 + AI 分析
        2. generator.run() -- X 投稿文生成 (140字以内)
        3. x_poster.post_tweet() -- X に投稿
        4. discord_notify.tweet_done() -- Discord 通知
```

## Schedule (GitHub Actions)

| Cycle   | Cron (UTC)       | JST 実行時刻       |
|---------|------------------|--------------------|
| morning | `0 21 * * *`     | 06:00〜06:30 JST   |
| night   | `0 10 * * *`     | 19:00〜19:30 JST   |

※ random delay により実際の投稿時刻は最大 30 分ずれる（凍結対策）

## Plan Limits

| Plan     | アカウント数 | サイクル           | 月額   |
|----------|-----------|--------------------|--------|
| free     | 1         | morning のみ       | 無料   |
| pro      | 3         | morning + night    | ¥2,980 |
| business | 10        | morning + night    | ¥9,800 |

## Database Schema

`supabase/001_initial_schema.sql` 参照。主要テーブル:

- `users` -- プラン・Discord webhook
- `accounts` -- X アカウント情報 (x_username, x_password_enc, genre_id)
- `posts` -- 投稿履歴 (tweet_text, x_tweet_id, status: queued/posted/failed)
- `research` -- 収集したトレンドツイート
- `logs` -- ログ

## Key Conventions

- Python worker は **asyncio** で複数ユーザーを並列処理
- アカウント間に 15〜20 分のランダム待機を挟む（API レート保護）
- X 認証は **公式 X API V2 の Bearer Token + OAuth 1.0a 4点** をアカウント行に保存
  （`x_bearer_token`, `x_api_key`, `x_api_secret`, `x_access_token`, `x_access_token_secret`）
- 旧 `x_password_enc` は廃止予定（`X_CLIENT=playwright` の緊急フォールバック専用、NULL 可）
- `X_BEARER_TOKEN` 環境変数を設定するとアカウント未設定時のスクレイピング fallback として利用可
- GitHub Actions Secrets: `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`,
  （任意）`X_BEARER_TOKEN`
