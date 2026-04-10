"""
Main entry point for GitHub Actions cron execution.

Usage:
    python worker.py --cycle morning        (Cron: 朝)
    python worker.py --cycle noon           (Cron: 昼)
    python worker.py --cycle night          (Cron: 夜)
    python worker.py --mode reply-once      (1回だけリプライチェックして終了)
"""

import argparse
import asyncio
import json
import os
import random
import sys
from datetime import datetime, timezone, timedelta

# ---------------------------------------------------------------------------
# Ensure scripts/ is on sys.path so `modules.*` imports resolve correctly
# regardless of the working directory when invoked by GitHub Actions.
# ---------------------------------------------------------------------------
_SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from loguru import logger

from modules import (
    db,
    discord_notify,
    generator,
    note_poster,
    reply_checker,
    reply_classifier,
    reply_generator,
    scraper,
    x_poster,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
JST = timezone(timedelta(hours=9))

CYCLE_TARGETS = {
    "morning": (7, 0),
    "noon": (12, 30),
    "night": (20, 0),
}
RANDOM_RANGE_MINUTES = 15
ACCOUNT_INTERVAL_RANGE = (15, 20)  # minutes between accounts

REPLY_CHECK_BASE_MINUTES = 30        # kept for reference / future use
REPLY_CHECK_RANGE_MINUTES = 5        # kept for reference / future use

# GitHub Actions jobs have a bounded runtime. Never sleep more than this
# inside wait_until_random_time — if the target is further out, something
# is wrong (stale trigger, wrong TZ, etc.) and we'd rather run immediately.
MAX_SLEEP_SECONDS = 10 * 60  # 10 minutes

# ---------------------------------------------------------------------------
# Plan limits (placeholder — will be loaded from config / Supabase later)
# ---------------------------------------------------------------------------
PLAN_LIMITS = {
    "free": {"accounts": 1, "cycles": ["morning"]},
    "starter": {"accounts": 3, "cycles": ["morning", "noon"]},
    "pro": {"accounts": 10, "cycles": ["morning", "noon", "night"]},
    "business": {"accounts": 10, "cycles": ["morning", "noon", "night"]},
}


# ---------------------------------------------------------------------------
# Genre config loader
# ---------------------------------------------------------------------------
_GENRES_PATH = os.path.join(_SCRIPTS_DIR, "config", "genres.json")
_GENRE_CACHE: dict | None = None


def load_genre_configs() -> dict:
    """Load genres.json and return a mapping name -> config dict."""
    global _GENRE_CACHE
    if _GENRE_CACHE is not None:
        return _GENRE_CACHE
    try:
        with open(_GENRES_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        genres = data.get("genres", [])
        _GENRE_CACHE = {g["name"]: g for g in genres if "name" in g}
        logger.info(f"Loaded {len(_GENRE_CACHE)} genre config(s) from {_GENRES_PATH}")
    except Exception as e:
        logger.error(f"Failed to load genres.json at {_GENRES_PATH}: {e}")
        _GENRE_CACHE = {}
    return _GENRE_CACHE


def get_genre_config(genre_id: str) -> dict:
    """Return the genre config for a given genre_id, or an empty fallback."""
    configs = load_genre_configs()
    cfg = configs.get(genre_id)
    if cfg is None:
        logger.warning(f"Genre '{genre_id}' not found in genres.json — using fallback")
        return {"name": genre_id or "general"}
    return cfg


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def wait_until_random_time(cycle: str):
    """Wait until the base target time +/- RANDOM_RANGE_MINUTES for the given cycle."""
    if cycle not in CYCLE_TARGETS:
        raise ValueError(f"Unknown cycle: {cycle}")

    base_hour, base_minute = CYCLE_TARGETS[cycle]
    offset_minutes = random.randint(-RANDOM_RANGE_MINUTES, RANDOM_RANGE_MINUTES)

    now = datetime.now(JST)
    target = now.replace(hour=base_hour, minute=base_minute, second=0, microsecond=0)
    target += timedelta(minutes=offset_minutes)

    # If the target time is already past, run immediately
    wait_seconds = (target - now).total_seconds()
    if wait_seconds <= 0:
        logger.info(f"[{cycle}] Target time already passed — starting immediately")
        return

    # Cap the sleep to avoid blowing past the GitHub Actions job timeout.
    # If the target is hours away (e.g. trigger fired in the wrong TZ),
    # just run now rather than sleeping 13+ hours.
    if wait_seconds > MAX_SLEEP_SECONDS:
        logger.warning(
            f"[{cycle}] Target {target.strftime('%H:%M')} JST is "
            f"{wait_seconds:.0f}s away (> {MAX_SLEEP_SECONDS}s cap) — "
            f"running immediately"
        )
        return

    logger.info(
        f"[{cycle}] Waiting until {target.strftime('%H:%M')} JST "
        f"({wait_seconds:.0f}s)"
    )
    await asyncio.sleep(wait_seconds)


def get_allowed_accounts(user: dict) -> list:
    """Return the slice of accounts the user's plan allows."""
    plan = user.get("plan", "free")
    limit = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])["accounts"]

    accounts = user.get("accounts", [])
    allowed = accounts[:limit]

    if len(accounts) > limit:
        logger.info(
            f"User {user.get('id')} on plan '{plan}': "
            f"{len(accounts)} accounts, limited to {limit}"
        )
    return allowed


def get_allowed_cycles(user: dict) -> list:
    """Return the list of cycles the user's plan permits."""
    plan = user.get("plan", "free")
    return PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])["cycles"]


# ---------------------------------------------------------------------------
# Core processing
# ---------------------------------------------------------------------------
async def process_user(user: dict, cycle: str):
    """
    Process a single user for a given cycle.
    For each allowed account: scrape -> generate -> save post -> publish to note -> promo tweet.
    Accounts are processed sequentially with a random delay between them.
    """
    if cycle not in get_allowed_cycles(user):
        logger.info(
            f"User {user.get('id')} plan '{user.get('plan')}' "
            f"does not include cycle '{cycle}' — skipping"
        )
        return

    # Attach the user's accounts from Supabase
    user_accounts = db.get_accounts(user["id"])
    user = {**user, "accounts": user_accounts}

    accounts = get_allowed_accounts(user)
    if not accounts:
        logger.warning(f"User {user.get('id')} has no accounts — skipping")
        return

    await discord_notify.cycle_start(user, cycle, len(accounts))

    for idx, account in enumerate(accounts):
        account_name = account.get("name", "unknown")
        logger.info(f"Processing account '{account_name}' ({idx + 1}/{len(accounts)})")

        genre_config = get_genre_config(account.get("genre_id", ""))
        post_id = ""
        post: dict = {}

        try:
            # --- Step 1: Scrape trending / reference articles ---
            research = await scraper.run(account, genre_config)
            logger.debug(f"[{account_name}] Scraping complete")

            # --- Step 2: Generate article with AI ---
            post = await generator.run(account, research, cycle, genre_config)
            post["cycle"] = cycle
            logger.debug(f"[{account_name}] Generation complete")

            # --- Step 3: Save draft to Supabase ---
            post_id = db.save_post(user["id"], account["id"], post)
            if not post_id:
                raise RuntimeError("save_post returned empty id")
            post["id"] = post_id
            logger.debug(f"[{account_name}] Saved post {post_id}")

            # --- Step 4: Publish to note.com ---
            note_url = await note_poster.run(account, post)
            logger.debug(f"[{account_name}] Published to note: {note_url}")

            # --- Step 5: Post promo tweet on X ---
            try:
                x_tweet_id = await x_poster.run(account, post, note_url, genre_config)
            except Exception as xe:
                logger.error(f"[{account_name}] X promo tweet failed: {xe}")
                x_tweet_id = None

            # --- Step 6: Mark post as posted ---
            db.update_post_status(
                post_id,
                "posted",
                note_url=note_url,
                x_tweet_id=x_tweet_id,
            )
            db.save_log(
                user["id"],
                "info",
                "worker.process_user",
                f"Published '{post.get('title', '')[:40]}' -> {note_url}",
                account_id=account["id"],
            )

            await discord_notify.post_done(user, account, post, note_url)

        except Exception as e:
            logger.exception(f"Error processing account '{account_name}': {e}")
            if post_id:
                db.update_post_status(post_id, "failed", error_message=str(e))
            try:
                db.save_log(
                    user["id"],
                    "error",
                    "worker.process_user",
                    str(e),
                    account_id=account.get("id"),
                )
            except Exception:
                pass
            try:
                await discord_notify.error(user, "worker.process_user", str(e), account)
            except Exception:
                logger.exception("Failed to send discord error notification")

        # Wait between accounts (except after the last one)
        if idx < len(accounts) - 1:
            interval = random.randint(*ACCOUNT_INTERVAL_RANGE) * 60
            logger.info(f"Waiting {interval // 60} min before next account")
            await asyncio.sleep(interval)


async def run_cycle(cycle: str):
    """
    Run a single posting cycle for all active users.
    Users are processed concurrently with asyncio.gather.
    """
    logger.info(f"=== Starting cycle: {cycle} ===")

    await wait_until_random_time(cycle)

    users: list[dict] = db.get_active_users()
    logger.info(f"Fetched {len(users)} active user(s)")

    if not users:
        logger.warning("No active users found — nothing to do")
        return

    results = await asyncio.gather(
        *(process_user(user, cycle) for user in users),
        return_exceptions=True,
    )

    for user, result in zip(users, results):
        if isinstance(result, Exception):
            logger.error(
                f"User {user.get('id')} failed with exception: {result}"
            )
            try:
                await discord_notify.error(
                    user, "worker.run_cycle", str(result)
                )
            except Exception:
                logger.exception("Failed to send error notification")

    logger.info(f"=== Cycle {cycle} complete ===")


async def run_reply_once():
    """
    Run a single reply-check pass for every active user / account, then exit.
    Designed to be called from a GitHub Actions cron job (e.g. hourly).

    Pipeline per account:
      reply_checker.run -> classifier -> (if not spam) generator -> x_poster.post_reply
      -> db.save_reply / db.mark_reply_responded
    """
    logger.info("=== Starting reply-once pass ===")

    try:
        users: list[dict] = db.get_active_users()

        for user in users:
            user_accounts = db.get_accounts(user["id"])
            user_with_accts = {**user, "accounts": user_accounts}
            accounts = get_allowed_accounts(user_with_accts)

            for account in accounts:
                account_name = account.get("name", "unknown")
                genre_config = get_genre_config(account.get("genre_id", ""))
                processed = 0

                try:
                    # --- Step 1: Scrape replies from X ---
                    scraped_replies = await reply_checker.run(account)
                    logger.info(
                        f"[reply] {account_name}: {len(scraped_replies)} raw replies scraped"
                    )

                    for reply in scraped_replies:
                        reply_text = reply.get("reply_text", "")

                        # --- Step 2: Classify ---
                        classification = reply_classifier.classify(reply_text)
                        is_spam = classification.get("is_spam", False)
                        reply_type = classification.get("type", "neutral")

                        # Persist the incoming reply (spam or not)
                        db.save_reply(
                            user["id"],
                            account["id"],
                            {
                                "reply_tweet_id": reply.get("reply_tweet_id"),
                                "original_tweet_id": reply.get("original_tweet_id", ""),
                                "reply_text": reply_text,
                                "is_spam": is_spam,
                            },
                        )

                        if is_spam:
                            logger.debug(
                                f"[reply] {account_name}: skipped spam reply from "
                                f"@{reply.get('author', '?')}"
                            )
                            continue

                        # --- Step 3: Generate response ---
                        try:
                            response_text = await reply_generator.run(
                                account, reply, reply_type, genre_config
                            )
                        except Exception as ge:
                            logger.error(
                                f"[reply] Generator failed for @{reply.get('author', '?')}: {ge}"
                            )
                            continue

                        # --- Step 4: Post the reply on X ---
                        try:
                            await x_poster.post_reply(
                                account,
                                reply.get("reply_tweet_id", ""),
                                response_text,
                            )
                        except Exception as pe:
                            logger.error(
                                f"[reply] post_reply failed for @{reply.get('author', '?')}: {pe}"
                            )
                            continue

                        # --- Step 5: Mark as responded ---
                        # Need the DB row id that save_reply just upserted
                        try:
                            resp = (
                                db.supabase.table("replies")
                                .select("id")
                                .eq("user_id", user["id"])
                                .eq("reply_tweet_id", reply.get("reply_tweet_id"))
                                .single()
                                .execute()
                            )
                            reply_id = resp.data.get("id") if resp.data else None
                        except Exception:
                            reply_id = None

                        if reply_id:
                            db.mark_reply_responded(reply_id, response_text)
                        processed += 1

                    logger.info(
                        f"[reply] {account_name}: responded to {processed} reply(ies)"
                    )
                    if processed > 0:
                        await discord_notify.reply_done(user, account, processed)

                except Exception as e:
                    logger.exception(
                        f"[reply] Error for account '{account_name}': {e}"
                    )
                    try:
                        await discord_notify.error(
                            user, "worker.run_reply_once", str(e), account
                        )
                    except Exception:
                        logger.exception("Failed to send discord error notification")

    except Exception as e:
        logger.exception(f"[reply] Top-level error in reply-once pass: {e}")

    logger.info("=== Reply-once pass complete ===")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="note-auto worker")
    parser.add_argument(
        "--cycle",
        choices=["morning", "noon", "night"],
        help="Run a posting cycle (morning / noon / night)",
    )
    parser.add_argument(
        "--mode",
        choices=["reply-once"],
        help="Run mode (reply-once = single reply-check pass, then exit)",
    )
    args = parser.parse_args()

    if args.cycle:
        logger.info(f"Worker started — cycle mode: {args.cycle}")
        asyncio.run(run_cycle(args.cycle))
    elif args.mode == "reply-once":
        logger.info("Worker started — reply-once mode")
        asyncio.run(run_reply_once())
    else:
        parser.print_help()
        raise SystemExit(1)


if __name__ == "__main__":
    main()
