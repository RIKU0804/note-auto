# note-auto -- X x note 自動化 SaaS

X (旧Twitter) のトレンドを自動収集し投稿するSaaS プラットフォームです。
1日3回 (朝・昼・夜) の自動サイクルで、完全自動化します。

---

## アーキテクチャ

```
                         +------------------+
                         |   Vercel (Next.js)|
                         |   ダッシュボード    |
                         |   /src            |
                         +--------+---------+
                                  |
                                  | Supabase Auth / DB
                                  |
                         +--------+---------+
                         |    Supabase      |
                         |  - PostgreSQL    |
                         |  - Auth          |
                         |  - RLS           |
                         +--------+---------+
                                  |
                    +-------------+-------------+
                    |                           |
           +--------+--------+       +---------+---------+
           | GitHub Actions  |       | Vercel Cron       |
           | (Python worker) |       | /api/cron/cycle   |
           | /scripts        |       | (バックアップ用)    |
           +--------+--------+       +-------------------+
                    |
       +------------+------------+
       |            |            |
  +----+---+  +----+---+  +----+----+
  | Scraper|  |Generator|  | Poster  |
  | (X)    |  | (AI)    |  | (note)  |
  +--------+  +---------+  +---------+
       |            |
  Playwright   OpenRouter
               (Claude 3 Haiku)

  +-------------------+
  | Discord Webhook   |
  | (通知)            |
  +-------------------+
```

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド / ダッシュボード | Next.js 15, React 19, Tailwind CSS 4, TypeScript |
| バックエンド (API) | Next.js API Routes (Vercel) |
| データベース / 認証 | Supabase (PostgreSQL + Auth + RLS) |
| 自動化ワーカー | Python 3.12, Playwright, GitHub Actions |
| AI 記事生成 | OpenRouter (Claude 3 Haiku) |
| ブラウザ自動化 | Playwright (Chromium) |
| 通知 | Discord Webhook |
| ホスティング | Vercel (ダッシュボード), GitHub Actions (ワーカー) |

---

## セットアップ手順

### 1. リポジトリをクローン

```bash
git clone https://github.com/<your-username>/note-auto.git
cd note-auto
```

### 2. 依存関係をインストール

```bash
npm install
```

### 3. Supabase プロジェクトのセットアップ

1. [Supabase](https://supabase.com) で新規プロジェクトを作成
2. SQL Editor を開き、マイグレーションファイルを実行:

```sql
-- supabase/001_initial_schema.sql の内容をすべて貼り付けて実行
```

3. Authentication > Providers で Email を有効化

### 4. 環境変数の設定

`.env.example` をコピーして `.env.local` を作成:

```bash
cp .env.example .env.local
```

以下の変数を設定:

| 変数名 | 説明 | 取得先 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL | Supabase ダッシュボード > Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名キー | 同上 |
| `SUPABASE_URL` | Supabase プロジェクト URL (サーバー用) | 同上 |
| `SUPABASE_KEY` | Supabase サービスロールキー | 同上 |
| `OPENROUTER_API_KEY` | OpenRouter API キー | [OpenRouter](https://openrouter.ai) |
| `OPENROUTER_MODEL` | 使用する AI モデル | デフォルト: `anthropic/claude-3-haiku` |
| `CRON_SECRET` | Vercel Cron 認証用シークレット | 任意の文字列を生成 |

### 5. GitHub Actions Secrets の設定

リポジトリの Settings > Secrets and variables > Actions で以下を追加:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`

### 6. Vercel へデプロイ

1. [Vercel](https://vercel.com) でプロジェクトをインポート
2. 環境変数を設定 (手順 4 と同じ値)
3. デプロイ実行

---

## 使い方

### 1. ダッシュボードに登録・ログイン

デプロイされた URL にアクセスし、メールアドレスでアカウントを作成します。

### 2. X / note アカウントを追加

ダッシュボードから自動化対象の X アカウントと note アカウントの認証情報を登録します。
ジャンル (ライフスタイル / お金 / 健康 / キャリア) を選択すると、そのジャンルに最適化された記事が生成されます。

### 3. Discord Webhook を設定

投稿通知を受け取る Discord チャンネルの Webhook URL を設定します。
投稿完了・エラー発生時に自動通知されます。

### 4. 自動投稿 (1日3回)

システムが自動で以下のサイクルを実行します:

| サイクル | 実行時刻 (JST) | 説明 |
|---|---|---|
| morning | 06:45 頃 | 朝の投稿サイクル |
| noon | 12:15 頃 | 昼の投稿サイクル |
| night | 19:45 頃 | 夜の投稿サイクル |

各サイクルの処理フロー:
1. X からトレンドを収集
2. AI で note 有料記事を生成
3. note に記事を投稿
4. X で宣伝ツイートを投稿
5. Discord に通知

リプライチェックは毎時自動実行され、スパム判定・自動返信を行います。

---

## プラン一覧

| | Free | Pro | Business |
|---|---|---|---|
| 月額料金 | 0円 | 3,000円 | 10,000円 |
| アカウント数 | 1 | 3 | 10 |
| 投稿サイクル | 朝のみ | 朝・昼・夜 | 朝・昼・夜 |
| リプライ自動化 | - | あり | あり |

---

## 開発

### ローカル開発サーバー

```bash
npm run dev
```

http://localhost:3000 でダッシュボードが起動します。

### ビルド

```bash
npm run build
```

### Python ワーカーのローカル実行

```bash
cd scripts
pip install -r requirements.txt
playwright install chromium --with-deps
python worker.py --cycle morning
```

### ディレクトリ構成

```
note-auto/
├── src/                     # Next.js ダッシュボード (TypeScript)
│   ├── app/                 # App Router ページ
│   ├── lib/                 # ユーティリティ (Supabase クライアント等)
│   └── middleware.ts        # 認証ミドルウェア
├── scripts/                 # Python 自動化ワーカー
│   ├── worker.py            # メインエントリーポイント
│   ├── modules/             # 各機能モジュール
│   │   ├── scraper.py       # X トレンド収集
│   │   ├── generator.py     # AI 記事生成
│   │   ├── note_poster.py   # note 投稿
│   │   ├── x_poster.py      # X ツイート投稿
│   │   ├── reply_checker.py # リプライ検出
│   │   ├── reply_classifier.py # スパム分類
│   │   ├── reply_generator.py  # 自動返信生成
│   │   ├── discord_notify.py   # Discord 通知
│   │   └── db.py            # Supabase DB 操作
│   ├── config/
│   │   └── genres.json      # ジャンル設定
│   └── requirements.txt     # Python 依存関係
├── supabase/
│   └── 001_initial_schema.sql  # DB マイグレーション
├── .github/workflows/       # GitHub Actions cron ジョブ
│   ├── morning.yml
│   ├── noon.yml
│   ├── night.yml
│   └── replies.yml
├── vercel.json              # Vercel デプロイ設定
└── package.json
```
