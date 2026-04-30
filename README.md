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
- [ダッシュボードの使い方](#ダッシュボードの使い方)
- [自動実行の仕組み](#自動実行の仕組み)
- [プラン制限](#プラン制限)
- [トラブルシューティング](#トラブルシューティング)
- [開発者向け](#開発者向け)
- [ライセンス](#ライセンス)
- [コントリビュート](#コントリビュート)

---

## このリポジトリは何か

X のトレンドを定期収集し、OpenRouter 経由で AI に投稿文を生成させ、Playwright で X に自動投稿する SaaS。
複数アカウント・ジャンル別投稿スタイル・Discord 通知に対応。Vercel と GitHub Actions の無料枠だけで運用可能。

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
                                              Playwright       OpenRouter
                                              (X login)        (Claude 3 Haiku)
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
3. **New query** で以下を貼り付けて実行:
   - `supabase/001_initial_schema.sql` の内容すべて
4. （旧バージョンからアップグレードする場合のみ）`supabase/002_remove_note.sql` も実行
5. **Project Settings → API** ページで以下をメモする:
   - `Project URL` (例: `https://xxxx.supabase.co`)
   - `anon public` キー (ダッシュボード公開用)
   - `service_role` キー (ワーカー用、絶対に公開しない)

> ⚠️ **ハマりどころ**: `service_role` キーをクライアント側 (`NEXT_PUBLIC_*`) に
> 設定すると RLS が完全に迂回されてセキュリティ事故になります。GitHub Actions と
> Vercel のサーバー側環境変数 (`SUPABASE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`) のみに
> 入れてください。

---

### Step 3 — OpenRouter アカウント

1. https://openrouter.ai にサインアップ
2. **Keys** ページで API キーを発行 (`sk-or-v1-...`)
3. 使用モデルを決める。デフォルト推奨は `anthropic/claude-3-haiku` (安価で十分な品質)
4. 必要に応じてアカウントに少額チャージ ($5 程度で数千ツイート分)

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
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=anthropic/claude-3-haiku

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
| `OPENROUTER_API_KEY` | Step 3 の API キー |
| `OPENROUTER_MODEL` | `anthropic/claude-3-haiku` |

`gh` CLI で一括投入する場合:

```bash
gh secret set SUPABASE_URL --body "https://xxxx.supabase.co"
gh secret set SUPABASE_KEY --body "eyJ...service_role"
gh secret set OPENROUTER_API_KEY --body "sk-or-v1-..."
gh secret set OPENROUTER_MODEL --body "anthropic/claude-3-haiku"
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

## ダッシュボードの使い方

### アカウント追加

`/accounts` の **アカウント追加** から:

- **アカウント名**: 自分が判別できる名前 (例: 自己啓発アカウント)
- **ジャンル**: AI のスタイルに影響 (自己啓発 / ビジネス / 健康・美容 / テクノロジー)
- **X ユーザー名**: ログイン用の `@` なしユーザー名 / メールアドレス
- **X パスワード**: ログイン用パスワード (現状は AES 等の本格暗号化前の状態で DB に保存。
  本番運用では Supabase Vault への移行を強く推奨)
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
- モデルを `anthropic/claude-3-haiku` から軽量モデル (`mistralai/mistral-7b-instruct` など)
  に切り替えるとコストを下げられる

### X ログインで凍結される

- アカウントを連続作成・連続投稿していると凍結対象。投稿間隔を伸ばし、ジャンルごとに
  別アカウントを使う運用を推奨
- 凍結されたアカウントは `/accounts` で **停止** にしてから新規アカウントを追加

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
│   │   ├── scraper.py            # X トレンド収集 + AI 分析
│   │   ├── generator.py          # X 投稿文生成 (OpenRouter)
│   │   ├── x_poster.py           # X 投稿 (Playwright)
│   │   ├── discord_notify.py     # Discord 通知
│   │   └── db.py                 # Supabase DB 操作
│   ├── config/genres.json        # ジャンル設定
│   └── requirements.txt
├── supabase/
│   ├── 001_initial_schema.sql    # 新規セットアップ用
│   └── 002_remove_note.sql       # 既存DBから note 関連カラムを削除
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
