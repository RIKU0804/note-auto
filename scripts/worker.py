"""
Main entry point for GitHub Actions cron execution.

Usage:
    python worker.py --cycle morning
    python worker.py --cycle night
"""

import argparse
import asyncio
import json
import os
import random
import sys

_SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from loguru import logger

from modules import db, discord_notify, generator, scraper, x_poster

# ---------------------------------------------------------------------------
# Plan limits
# ---------------------------------------------------------------------------
PLAN_LIMITS = {
    "free":     {"accounts": 1,  "cycles": ["morning"]},
    "pro":      {"accounts": 3,  "cycles": ["morning", "night"]},
    "business": {"accounts": 10, "cycles": ["morning", "night"]},
}

# ---------------------------------------------------------------------------
# Genre config loader
# ---------------------------------------------------------------------------
_GENRES_PATH = os.path.join(_SCRIPTS_DIR, "config", "genres.json")
_GENRE_CACHE: dict | None = None


def load_genre_configs() -> dict:
    global _GENRE_CACHE
    if _GENRE_CACHE is not None:
        return _GENRE_CACHE
    try:
        with open(_GENRES_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        genres = data.get("genres", [])
        _GENRE_CACHE = {g["name"]: g for g in genres if "name" in g}
        logger.info("Loaded {} genre config(s)", len(_GENRE_CACHE))
    except Exception as e:
        logger.error("Failed to load genres.json: {}", e)
        _GENRE_CACHE = {}
    return _GENRE_CACHE


def get_genre_config(genre_id: str) -> dict:
    configs = load_genre_configs()
    cfg = configs.get(genre_id)
    if cfg is None:
        logger.warning("Genre '{}' not found — using fallback", genre_id)
        return {"name": genre_id or "general"}
    return cfg


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_allowed_accounts(user: dict) -> list:
    plan = user.get("plan", "free")
    limit = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])["accounts"]
    accounts = user.get("accounts", [])
    if len(accounts) > limit:
        logger.info("User {} plan '{}': {} accounts, limited to {}", user.get("id"), plan, len(accounts), limit)
    return accounts[:limit]


def get_allowed_cycles(user: dict) -> list:
    plan = user.get("plan", "free")
    return PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])["cycles"]


# ---------------------------------------------------------------------------
# Core processing
# ---------------------------------------------------------------------------

async def process_user(user: dict, cycle: str):
    """Process a single user for a given cycle: scrape → generate → post → notify."""
    if cycle not in get_allowed_cycles(user):
        logger.info("User {} plan '{}' does not include cycle '{}' — skipping",
                    user.get("id"), user.get("plan"), cycle)
        return

    user_accounts = db.get_accounts(user["id"])
    user = {**user, "accounts": user_accounts}
    accounts = get_allowed_accounts(user)

    if not accounts:
        logger.warning("User {} has no accounts — skipping", user.get("id"))
        return

    await discord_notify.cycle_start(user, cycle, len(accounts))

    for idx, account in enumerate(accounts):
        account_name = account.get("name", "unknown")
        logger.info("Processing account '{}' ({}/{})", account_name, idx + 1, len(accounts))

        genre_config = get_genre_config(account.get("genre_id", ""))
        post_id = ""
        post: dict = {}

        try:
            # Step 1: Scrape X trends
            research = await scraper.run(account, genre_config)

            # Step 2: Generate X post text
            post = await generator.run(account, research, cycle, genre_config)
            post["cycle"] = cycle

            # Step 3: Save draft to DB
            post_id = db.save_post(user["id"], account["id"], post)
            if not post_id:
                raise RuntimeError("save_post returned empty id")
            post["id"] = post_id

            # Step 4: Post to X
            post_result = await x_poster.post_tweet(account, post["tweet_text"])
            tweet_id = post_result.get("tweet_id", "") if isinstance(post_result, dict) else str(post_result)
            tweet_url = (
                f"https://x.com/{account.get('x_username', '')}/status/{tweet_id}"
                if tweet_id else ""
            )

            # Step 5: Update DB and log
            db.update_post_status(post_id, "posted", x_tweet_id=tweet_id or None)
            db.save_log(
                user["id"], "info", "worker",
                f"Posted tweet {tweet_id} for '{account_name}'",
                account_id=account["id"],
            )

            # Step 6: Discord notification
            await discord_notify.tweet_done(user, account, post, tweet_url)
            logger.info("Account '{}' done — tweet: {}", account_name, tweet_url)

        except Exception as e:
            logger.exception("Error for account '{}': {}", account_name, e)
            if post_id:
                db.update_post_status(post_id, "failed", error_message=str(e))
            try:
                db.save_log(user["id"], "error", "worker", str(e), account_id=account.get("id"))
            except Exception:
                pass
            try:
                await discord_notify.error(user, "worker", str(e), account)
            except Exception:
                logger.exception("Failed to send Discord error notification")

        # Random wait between accounts to avoid rate limits
        if idx < len(accounts) - 1:
            interval = random.randint(15, 20) * 60
            logger.info("Waiting {} min before next account", interval // 60)
            await asyncio.sleep(interval)


async def run_cycle(cycle: str):
    """Run a posting cycle for all active users."""
    logger.info("=== Starting cycle: {} ===", cycle)

    users: list[dict] = db.get_active_users()
    logger.info("Fetched {} active user(s)", len(users))

    if not users:
        logger.warning("No active users — nothing to do")
        return

    results = await asyncio.gather(
        *(process_user(user, cycle) for user in users),
        return_exceptions=True,
    )

    for user, result in zip(users, results):
        if isinstance(result, Exception):
            logger.error("User {} failed: {}", user.get("id"), result)
            try:
                await discord_notify.error(user, "worker.run_cycle", str(result))
            except Exception:
                pass

    logger.info("=== Cycle {} complete ===", cycle)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="note-auto X posting worker")
    parser.add_argument("--cycle", choices=["morning", "night"], required=True,
                        help="Posting cycle to run")
    args = parser.parse_args()

    logger.info("Worker started — cycle: {}", args.cycle)
    asyncio.run(run_cycle(args.cycle))


if __name__ == "__main__":
    main()
