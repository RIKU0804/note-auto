# CLAUDE.md -- Project Instructions

## Project Overview

X x note 自動化 SaaS。X のトレンドを収集し、AI で note 有料記事を生成・投稿するプラットフォーム。

## Tech Stack

- **Dashboard**: Next.js 15 (App Router), React 19, Tailwind CSS 4, TypeScript
- **Database / Auth**: Supabase (PostgreSQL, Auth, RLS)
- **Worker**: Python 3.12, Playwright, GitHub Actions
- **AI**: OpenRouter (Claude 3 Haiku)
- **Hosting**: Vercel (dashboard), GitHub Actions (worker cron)

## Build & Dev Commands

```bash
npm run dev        # Start Next.js dev server on localhost:3000
npm run build      # Production build (also the Vercel build command)
npm run start      # Start production server locally
```

## Directory Structure

This project has two distinct parts:

### `src/` -- Next.js Dashboard (TypeScript)

The user-facing web dashboard hosted on Vercel. Users register, add X/note accounts, configure Discord webhooks, and monitor posting activity.

- `src/app/` -- App Router pages and API routes
- `src/lib/supabase/` -- Supabase client (browser) and server helpers
- `src/middleware.ts` -- Auth guard that redirects unauthenticated users to /login

### `scripts/` -- Python Automation Worker

The background automation engine that runs on GitHub Actions cron schedules. Does the actual scraping, AI generation, and posting.

- `scripts/worker.py` -- Main entry point. Accepts `--cycle morning|noon|night` or `--mode reply-once`
- `scripts/modules/` -- Feature modules:
  - `scraper.py` -- Scrapes X trending topics using Playwright
  - `generator.py` -- Generates note articles via OpenRouter API
  - `note_poster.py` -- Posts articles to note via Playwright
  - `x_poster.py` -- Posts promo tweets to X
  - `reply_checker.py` -- Checks for new replies on promo tweets
  - `reply_classifier.py` -- Classifies replies as spam/genuine
  - `reply_generator.py` -- Generates AI responses to genuine replies
  - `discord_notify.py` -- Sends notifications via Discord webhook
  - `db.py` -- Supabase database operations
- `scripts/config/genres.json` -- Genre definitions (keywords, pricing, tone)
- `scripts/requirements.txt` -- Python dependencies

### How the Two Parts Connect

1. **Supabase is the shared data layer.** Both the Next.js dashboard and the Python worker read/write to the same Supabase PostgreSQL database.
2. **GitHub Actions runs the Python worker** on cron schedules (3x/day for posting cycles, hourly for reply checks). The workflow files are in `.github/workflows/`.
3. **Vercel hosts the dashboard** and also has cron definitions in `vercel.json` as a backup trigger mechanism.
4. Users configure accounts and settings through the dashboard; the worker picks up those settings from Supabase and executes automation.

## Key Conventions

- All database tables use **Row Level Security (RLS)**. Users can only access their own data.
- Passwords for X/note accounts are stored encrypted in `note_password_enc` and `x_password_enc` columns.
- The Python worker uses **asyncio** for concurrent user processing within a cycle.
- Plan limits (free/pro/business) control how many accounts a user can automate and which cycles they can use.
- Cron schedules in GitHub Actions are in **UTC**. JST = UTC + 9.
- The `CRON_SECRET` env var is used to authenticate Vercel cron API route calls.

## Database Schema

The schema is defined in `supabase/001_initial_schema.sql`. Key tables:

- `users` -- Extends Supabase auth.users with plan, Discord webhook, etc.
- `accounts` -- X/note account pairs belonging to a user
- `posts` -- Generated and posted content (queued -> posted -> failed)
- `research` -- Scraped trending data from X
- `replies` -- Reply tracking and auto-response records
- `logs` -- Application logs
- `plan_limits` -- Plan tier definitions (free/pro/business)
