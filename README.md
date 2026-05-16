# note-auto

X (旧 Twitter) のトレンドを自動で収集し、AI が朝・夜の 1 日 2 回ツイートを生成・投稿する OSS。
ダッシュボード (Next.js) でアカウントを管理し、Python ワーカー (GitHub Actions) が定期実行する構成。

> このリポジトリ名に "note" が残っているのは歴史的な理由です。
> 現バージョンでは X (Twitter) のみを対象とし、note.com 連携は完全に削除されています。

---

## 目次

- [このリポジトリは何か](#このリポジトリは何か)
- [動作確認済み環境](#動作確認済み環境)
- [アーキテクチャ](#アーキテクチャ)
- [クイックスタート (5 分版)](#クイックスタート-5-分版)
- [詳細セットアップ (30 分版)](#詳細セットアップ-30-分版)
- [X API V2 セットアップ手順](#x-api-v2-セットアップ手順)
- [ダッシュボードの使い方](#ダッシュボードの使い方)
- [自動実行の仕組み](#自動実行の仕組み)
- [プラン制限](#プラン制限)
- [トラブルシューティング](#トラブルシューティング)
- [開発者向け](#開発者向け)
- [ライセンス](#ライセンス)
- [コントリビュート](#コントリビュート)

---

## このリポジトリは何か

X のトレンドを定期収集し、OpenRouter 経由で AI に投稿文を生成させ、**公式 X API V2 (Free tier)** で自動投稿する SaaS。
複数アカウント・ジャンル別投稿スタイル・Discord 通知に対応。Vercel と GitHub Actions の無料枠だけで運用可能。

> **2026-04 重要変更**: 旧バージョンは Playwright で X にブラウザログインしてスクレイピング・投稿
> していましたが、これは X の利用規約違反であり凍結リスクが高いため、**公式 X API V2** に切り替えました。
> 既存の Playwright 実装は `X_CLIENT=playwright` で緊急フォールバックとして残してありますが、
> 通常運用では使わないでください。詳細は [X API V2 セットアップ手順](#x-api-v2-セットアップ手順) を参照。

> スクリーンショット: `./docs/screenshots/dashboard.png` などをここに配置 (オプション)

---

## 動作確認済み環境

| 項目 | バージョン |
|------|-----------|
| Node.js | 20+ |
| Python | 3.12+ |
| OS | Windows 11 / macOS 14+ / Ubuntu 22.04+ |
| ブラウザ | Chrome / Firefox / Safari (最新) |

---

## アーキテクチャ

```
+----------------------+      Supabase Auth       +----------------------+
|  Next.js Dashboard   | <----------------------> |       Supabase       |
|  (Vercel)            |                          |  PostgreSQL + RLS    |
|  /src                |                          +----------+-----------+
+----------------------+                                     |
                                                             |
                                                             v
                                                  +----------+-----------+
                                                  |   GitHub Actions     |
                                                  |   Python Worker      |
                                                  |   /scripts           |
                                                  +----+-------+--------+
                                                       |       |
                                              tweepy           OpenRouter
                                              (X API V2)       (OpenAI gpt-4o-mini +
                                                                gpt-image-2)
                                                       |
                                                       v
                                               +----------------+
                                               | Discord Webhook|
                                               +----------------+
```

---

## クイックスタート (5 分版)

「とりあえずローカルでダッシュボードを立ち上げたい」場合の最短ルート。
Supabase / OpenRouter / Vercel のセットアップは [詳細セットアップ](#詳細セットアップ-30-分版) を参照。

```bash
# 1. Fork して clone
git clone https://github.com/<your-username>/note-auto.git
cd note-auto

# 2. 依存をインストール
npm install

# 3. 環境変数テンプレートをコピー
cp .env.example .env.local
# → .env.local を開き、最低限 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を埋める

# 4. ダッシュボード起動
npm run dev
# → http://localhost:3000
```

> ⚠️ **ハマりどころ**: `.env.local` を作らずに `npm run dev` すると、ログイン画面で
> "Failed to construct URL" 系のランタイムエラーになります。Supabase の URL とキーは
> 必ず先に設定してください。

---

## 詳細セットアップ (30 分版)

### Step 1 — GitHub に Fork

1. このリポジトリ右上の **Fork** をクリック
2. ローカルに clone

```bash
git clone https://github.com/<your-username>/note-auto.git
cd note-auto
npm install
```

> スクショプレースホルダー: `./docs/screenshots/fork-button.png`

---

### Step 2 — Supabase プロジェクトの作成

1. https://supabase.com にサインアップし、**New project** を作成
2. プロジェクトが起動したら左サイドバーの **SQL Editor** を開く
3. **New query** で以下を順番に貼り付けて実行:
   - `supabase/001_initial_schema.sql` の内容すべて
   - （旧バージョンからアップグレードする場合のみ）`supabase/002_remove_note.sql`
   - **`supabase/003_xapi_migration.sql`**（X API V2 用カラム追加。新規・既存問わず実行）
   - **`supabase/004_dashboard_alignment.sql`**（`post_interval_minutes` / `discord_user_id` / CHECK 制約等。新規・既存問わず実行）
   - **`supabase/005_image_posts.sql`**（`posts.image_prompt` / `has_image` 追加。画像生成連携に必須）
4. **Project Settings → API** ページで以下をメモする:
   - `Project URL` (例: `https://xxxx.supabase.co`)
   - `anon public` キー (ダッシュボード公開用)
   - `service_role` キー (ワーカー用、絶対に公開しない)

> ⚠️ **ハマりどころ**: `service_role` キーをクライアント側 (`NEXT_PUBLIC_*`) に
> 設定すると RLS が完全に迂回されてセキュリティ事故になります。GitHub Actions と
> Vercel のサーバー側環境変数 (`SUPABASE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`) のみに
> 入れてください。

---

### Step 3 — OpenAI アカウント

1. https://platform.openai.com にサインアップ
2. **API keys** ページで Secret key を発行 (`sk-...`)
3. 使用モデルを決める:
   - テキスト生成: `OPENAI_TEXT_MODEL`(既定 `gpt-4o-mini`、安価で十分な品質)
   - 画像生成:   `OPENAI_IMAGE_MODEL`(既定 `gpt-image-2`)
4. **Billing** から少額チャージ($10 程度で数千ツイート + 数百枚の画像)

---

### Step 4 — `.env.local` をローカルにセットアップ

```bash
cp .env.example .env.local
```

`.env.local` を開いて以下を埋める:

```env
# ダッシュボード (ブラウザに公開される)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# サーバーサイドのみ (Vercel 環境変数 / GitHub Secrets でも同じ値を使う)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJ...service_role

# OpenRouter
OPENAI_API_KEY=sk-...
OPENAI_TEXT_MODEL=gpt-4o-mini
OPENAI_IMAGE_MODEL=gpt-image-2

# Vercel cron 用シークレット (任意の長いランダム文字列)
CRON_SECRET=$(openssl rand -hex 32)
```

> ⚠️ **ハマりどころ**: `.env.local` は `.gitignore` 済みなのでコミットされませんが、
> エディタの履歴や IDE のクラウド同期でリークする例があります。発行後すぐに必要な
> サービス側で IP 制限やキーローテーションを設定するのが安全です。

---

### Step 5 — GitHub Actions Secrets

フォークしたリポジトリの **Settings → Secrets and variables → Actions** で以下を追加:

| Secret 名 | 値 |
|-----------|----|
| `SUPABASE_URL` | Step 2 の Project URL |
| `SUPABASE_KEY` | Step 2 の `service_role` キー |
| `OPENAI_API_KEY` | Step 3 の API キー |
| `OPENAI_TEXT_MODEL` | `gpt-4o-mini` 等 |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` 等 |
| `ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` で生成した 32 byte hex |
| `X_CLIENT` (任意) | `api`(既定) または `playwright` |
| `X_BEARER_TOKEN` (任意) | 共有スクレイパー用 Bearer Token |

`gh` CLI で一括投入する場合:

```bash
gh secret set SUPABASE_URL --body "https://xxxx.supabase.co"
gh secret set SUPABASE_KEY --body "eyJ...service_role"
gh secret set OPENAI_API_KEY --body "sk-..."
gh secret set OPENAI_TEXT_MODEL --body "gpt-4o-mini"
gh secret set OPENAI_IMAGE_MODEL --body "gpt-image-2"
```

> ⚠️ **ハマりどころ**: GitHub Actions の Secrets は `Settings → Secrets and variables`
> の **Actions** タブに入れてください。Codespaces / Dependabot タブに入れても
> ワークフローからは読めません。

---

### Step 6 — Vercel デプロイ

1. https://vercel.com にサインインし **Add New → Project**
2. フォークしたリポジトリを選択
3. **Environment Variables** に以下を追加 (本番 / Preview / Development すべて):

| 変数名 | 値 |
|--------|----|
| `NEXT_PUBLIC_SUPABASE_URL` | Step 2 の Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Step 2 の `anon public` キー |
| `SUPABASE_URL` | Step 2 の Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Step 2 の `service_role` キー |
| `CRON_SECRET` | Step 4 で生成した値 |
| `ENCRYPTION_KEY` | GitHub Actions Secrets と**同じ** 32 byte hex（鍵が違うと worker 側で復号できない） |

4. **Deploy** をクリック → 公開 URL が発行される

> ⚠️ **ハマりどころ**: Vercel の環境変数を設定し忘れるとビルドは通っても
> ランタイムでクラッシュします。デプロイ後にログイン画面が表示されない場合は
> Vercel の **Deployments → Function Logs** を確認してください。

---

### Step 7 — 動作確認

1. Vercel の公開 URL にアクセスして新規登録 → メール確認
2. ログインしてダッシュボード `/dashboard` が開けることを確認
3. **アカウント管理** から X アカウントを 1 件追加
4. **設定** で Discord Webhook URL を入れて「テスト送信」
5. 手動でワーカーを実行:

```bash
gh workflow run morning.yml
gh run watch                       # ログを追跡
```

`completed success` が出れば全段成功。

---

## X API V2 セットアップ手順

X 連携は **公式 X API V2 (Free tier)** で動きます。アカウントごとに以下の手順で
認証情報を取得し、ダッシュボードの **アカウント追加** フォームに貼り付けてください。

### Free tier の制約 (2026 年現在)

| 機能 | 制限 |
|------|------|
| ツイート投稿 | 月 100 ツイート |
| ツイート取得 (Recent Search 等) | 月 1,500 件 |
| トレンド API | **廃止済み（使えない）** |
| 認証 | OAuth 2.0 Bearer Token + OAuth 1.0a (User Context) |

> このプロジェクトは Free tier 内で動くよう、ジャンルごとに事前定義した
> キーワード（`scripts/config/genres.json` の `search_keywords`）で
> Recent Search を叩いてトレンドを近似します。1 サイクルあたりの取得件数は
> `scripts/modules/scraper.py` の `SCRAPE_CONFIG` で調整可能です。

### 手順

1. **X Developer Portal にサインイン**
   - https://developer.twitter.com/en/portal/dashboard
   - 利用するアカウントでログイン（投稿させたい X アカウントと同一でも別でも可）

2. **Project + App を作成**
   - **Add Project** → 名前を付ける
   - その配下に **App** を作成（例: `note-auto`）
   - User authentication settings は次のように設定:
     - App permissions: **Read and write**
     - Type of App: **Web App** など適当でよい
     - Callback URL: `http://localhost`（投稿のみで OAuth フローは使わないので任意）

3. **Keys and tokens タブで以下をコピー**
   - **Bearer Token**（OAuth 2.0、必須）
   - **API Key / API Key Secret**（Consumer Keys）
   - **Access Token / Access Token Secret**（投稿に必要）

4. **ダッシュボードのアカウント追加フォームに貼り付け**
   - `/accounts` → **アカウント追加**
   - **Bearer Token** に貼り付け（必須）
   - 投稿の安定のため、**API Key / API Secret / Access Token / Access Token Secret** も
     入れることを推奨（OAuth 1.0a User Context での投稿に使われる）
   - **X パスワード** 欄は空のままで OK（Playwright フォールバック専用）

5. **動作確認**
   ```bash
   gh workflow run morning.yml
   gh run watch
   ```
   `Tweet posted via X API V2: 1234...` のログが出れば成功。

### 緊急時のフォールバック (Playwright)

何らかの事情で公式 API が使えない場合、`X_CLIENT=playwright` を環境変数に設定すると
旧 Playwright 実装に切り替わります。

```bash
# GitHub Actions Secrets / .env.local など
X_CLIENT=playwright
```

ただし **X の利用規約違反** であり凍結リスクが高いため、緊急時以外は使わないでください。
この場合は `accounts.x_password_enc` に X のログインパスワードが必要です。

### スクレイパー専用の Bearer Token (任意)

複数アカウントで共通のトレンド収集を行いたい場合、各アカウントに Bearer Token を入れる
代わりに環境変数 `X_BEARER_TOKEN` を設定すると、スクレイピング時はそれが使われます。
投稿用 Token はアカウントごとに必要です。

---

## ダッシュボードの使い方

### アカウント追加

`/accounts` の **アカウント追加** から:

- **アカウント名**: 自分が判別できる名前 (例: 自己啓発アカウント)
- **ジャンル**: AI のスタイルに影響 (自己啓発 / ビジネス / 健康・美容 / テクノロジー)
- **X ユーザー名**: 投稿先 X アカウントの `@` なしユーザー名
- **Bearer Token**（必須）: X Developer Portal の **Keys and tokens** から取得
  （[X API V2 セットアップ手順](#x-api-v2-セットアップ手順) 参照）
- **API Key / API Secret / Access Token / Access Token Secret**（推奨）: 投稿の安定のため
  4 点とも入れることを推奨
- **X パスワード**（非推奨）: `X_CLIENT=playwright` の緊急フォールバック専用。
  通常は空のままでよい
- **投稿間隔（分）**: 同一アカウント内で連続投稿しない最低間隔

### ジャンル

`scripts/config/genres.json` で `search_keywords` と `article_style` を編集することで、
収集対象キーワードと AI の文体トーンをカスタマイズできます。

### Discord Webhook

`/settings` の **Discord 通知設定** に Discord サーバーの Webhook URL を入れる。
保存後 **テスト送信** を押して通知が届けば OK。サイクル開始・投稿成功・エラーが届きます。

### 投稿履歴

`/posts` でアカウント別 / ステータス別 / 日付別にフィルター可能。
失敗した投稿は **再試行** ボタンで再キューに戻せます。

---

## 自動実行の仕組み

### GitHub Actions cron

| ワークフロー | cron (UTC) | 実行時刻 (JST) |
|--------------|-----------|----------------|
| `morning.yml` | `0 21 * * *` | 06:00–06:30 |
| `night.yml` | `0 10 * * *` | 19:00–19:30 |

各ジョブは起動後に 0–30 分のランダム待機を入れて X の凍結リスクを下げる設計。

### 手動実行

```bash
gh workflow run morning.yml
gh workflow run night.yml
```

### Vercel Cron (バックアップ)

GitHub Actions が落ちたとき用に Vercel Cron からも `/api/cron/cycle?cycle=...` を叩く
構成になっています (`vercel.json` の `crons` を参照)。`CRON_SECRET` の Bearer 認証必須。

---

## プラン制限

| プラン | アカウント数 | サイクル | 月額 |
|--------|------------|---------|-----|
| Free | 1 | morning のみ | ¥0 |
| Pro | 3 | morning + night | ¥2,980 |
| Business | 10 | morning + night | ¥9,800 |

> プラン制限は `src/types/database.ts` の `PLAN_LIMITS` と Supabase の `plan_limits`
> テーブルで定義されています。OSS としてセルフホストする場合は自由に変更してください。

---

## トラブルシューティング

### `playwright install` が失敗する

```bash
# Linux で libasound2 が無いと言われたら
sudo apt-get install -y libasound2t64 libnss3 libxss1
# Mac
brew install --cask chromium
# または
playwright install chromium --with-deps
```

GitHub Actions では `runs-on: ubuntu-22.04` に固定済み (24.04 だと Playwright の
依存関係が壊れることがある)。

### GitHub Actions cron が走らない

- リポジトリが 60 日間アクティビティなしだと自動で cron が無効化される
  → 何かコミットを push するか手動 dispatch で再アクティブ化
- フォーク直後は workflow が無効化されている → **Actions** タブで **Enable**

### Supabase の RLS エラー (`new row violates row-level security policy`)

- `service_role` キーで動かしているはずの Python ワーカーが `anon` キーで動いている
  可能性が高い → `SUPABASE_KEY` の値を再確認
- ダッシュボード側で起きている場合は `auth.uid()` がセットされていない (未ログイン状態
  で API を叩いている) → middleware を経由しているか確認

### OpenRouter rate limit / 残高不足

- ログに `429` や `insufficient_quota` が出る → OpenRouter 側で Credits を追加
- モデルを `gpt-4o-mini` から軽量モデル (`gpt-4.1-nano` など) に切り替えるとコストを下げられる
- 画像生成のコストが高ければ、`OPENAI_IMAGE_MODEL` を未指定にしてテキスト専用運用に戻すか、
  `scripts/config/genres.json` の `image_prompt` を空にして該当ジャンルだけ画像なしにする

### X API のレート制限 / 認証エラー

- 月の Free tier 制限を超えると 429 Too Many Requests が返る → 翌月まで待機、または
  X Developer Portal で Basic / Pro tier にアップグレード
- 401 Unauthorized: Bearer Token または OAuth 1.0a 認証情報が間違っている
  → ダッシュボードの **アカウント編集** で Token を再貼り付け
- 403 Forbidden: App permissions が **Read only** になっている → Developer Portal で
  **Read and write** に変更し、Access Token を再生成
- ログ確認: `gh run view <run-id> --log` で `X API V2` 関連のメッセージを探す

### X ログインで凍結される（Playwright フォールバック使用時）

- 通常は **公式 X API V2** で動かしているため凍結されにくい
- `X_CLIENT=playwright` で動かしている場合のみ、ブラウザログインに起因する凍結が起こりうる
  → 速やかに `X_CLIENT=api` に戻し、Bearer Token を設定すること

### Vercel build が `module not found` で失敗

- ローカル `node_modules` を削除して `npm ci` を試す
- `package-lock.json` の不整合の場合がある

---

## 開発者向け

### ディレクトリ構成

```
note-auto/
├── src/                          # Next.js ダッシュボード (TypeScript)
│   ├── app/
│   │   ├── (dashboard)/          # 認証必須ページ群
│   │   │   ├── accounts/
│   │   │   ├── dashboard/
│   │   │   ├── posts/
│   │   │   └── settings/
│   │   ├── api/                  # API Routes
│   │   │   ├── accounts/
│   │   │   ├── cron/cycle/       # Vercel Cron 受け口
│   │   │   ├── posts/
│   │   │   └── settings/
│   │   ├── login/
│   │   ├── signup/
│   │   └── layout.tsx
│   ├── lib/supabase/             # Supabase client / server
│   ├── types/database.ts         # 共有型定義
│   └── middleware.ts             # 認証ミドルウェア
├── scripts/                      # Python ワーカー
│   ├── worker.py                 # メインエントリーポイント
│   ├── modules/
│   │   ├── scraper.py            # X トレンド収集 (X API V2 Recent Search) + AI 分析
│   │   ├── generator.py          # X 投稿文生成 (OpenRouter)
│   │   ├── x_poster.py           # X 投稿 (X API V2 / tweepy, X_CLIENT で切替)
│   │   ├── discord_notify.py     # Discord 通知
│   │   └── db.py                 # Supabase DB 操作
│   ├── tests/                    # mock テスト (tweepy)
│   ├── config/genres.json        # ジャンル設定
│   └── requirements.txt
├── supabase/
│   ├── 001_initial_schema.sql    # 新規セットアップ用
│   ├── 002_remove_note.sql       # 既存DBから note 関連カラムを削除
│   └── 003_xapi_migration.sql    # X API V2 用カラム追加（必須）
├── .github/workflows/
│   ├── morning.yml
│   └── night.yml
├── vercel.json
└── package.json
```

### ローカル開発

```bash
# Next.js dev server
npm run dev

# 本番ビルドの確認
npm run build
npm run start

# 型チェック
npx tsc --noEmit
```

### Python ワーカーをローカル実行

```bash
cd scripts
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
playwright install chromium --with-deps

# 環境変数を読み込んで実行 (.env.local を export)
python worker.py --cycle morning
```

### テスト実行

現バージョンには明示的なテストスイートは含まれていません。追加する場合は:

- TypeScript: Vitest + Testing Library
- Python: pytest
- E2E: Playwright Test

を推奨します。

### DB マイグレーション

このリポジトリは Supabase CLI を使わない手動運用です。新しいマイグレーションは
`supabase/00X_<name>.sql` という連番で追加し、各環境の SQL Editor で順次実行する
運用にしてください。

---

## ライセンス

MIT License — `LICENSE` ファイルを参照 (未配置ならフォーク時に追加してください)。

---

## コントリビュート

1. Fork してフィーチャーブランチを切る (`git checkout -b feat/xxx`)
2. 変更をコミット (`feat: ...` 形式の Conventional Commits 推奨)
3. `npm run build` と `npx tsc --noEmit` がクリーンであることを確認
4. Pull Request を作成し、変更内容と動作確認手順を記載

バグ報告 / 機能要望は GitHub Issues へ。
