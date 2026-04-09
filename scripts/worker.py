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

# ---------------------------------------------------------------------------
# Stub imports — replace with real modules once they are built
# ---------------------------------------------------------------------------
# TODO: from modules.scraper import run as scraper_run
# TODO: from modules.generator import run as generator_run
# TODO: from modules.note_poster import run as poster_run
# TODO: from modules.reply_checker import run as reply_checker_run
# TODO: from modules.db import get_active_users, get_accounts_for_user, save_post

from modules import discord_notify

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

# ---------------------------------------------------------------------------
# Plan limits (placeholder — will be loaded from config / Supabase later)
# ---------------------------------------------------------------------------
PLAN_LIMITS = {
    "free": {"accounts": 1, "cycles": ["morning"]},
    "starter": {"accounts": 3, "cycles": ["morning", "noon"]},
    "pro": {"accounts": 10, "cycles": ["morning", "noon", "night"]},
}


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
    if wait_seconds > 0:
        logger.info(
            f"[{cycle}] Waiting until {target.strftime('%H:%M')} JST "
            f"({wait_seconds:.0f}s)"
        )
        await asyncio.sleep(wait_seconds)
    else:
        logger.info(f"[{cycle}] Target time already passed — starting immediately")


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
    For each allowed account: scrape -> generate -> save post -> publish.
    Accounts are processed sequentially with a random delay between them.
    """
    if cycle not in get_allowed_cycles(user):
        logger.info(
            f"User {user.get('id')} plan '{user.get('plan')}' "
            f"does not include cycle '{cycle}' — skipping"
        )
        return

    accounts = get_allowed_accounts(user)
    if not accounts:
        logger.warning(f"User {user.get('id')} has no accounts — skipping")
        return

    await discord_notify.cycle_start(user, cycle, len(accounts))

    for idx, account in enumerate(accounts):
        account_name = account.get("name", "unknown")
        logger.info(f"Processing account '{account_name}' ({idx + 1}/{len(accounts)})")

        try:
            # --- Step 1: Scrape trending / reference articles ---
            # TODO: scraped_data = await scraper_run(account)
            scraped_data = {}  # placeholder
            logger.debug(f"[{account_name}] Scraping complete (stub)")

            # --- Step 2: Generate article with AI ---
            # TODO: generated = await generator_run(account, scraped_data, cycle)
            generated = {"title": "(stub) generated title", "body": "(stub) body", "cycle": cycle}
            logger.debug(f"[{account_name}] Generation complete (stub)")

            # --- Step 3: Save draft to Supabase ---
            # TODO: post = await save_post(user, account, generated)
            post = {**generated, "id": "stub-post-id"}
            logger.debug(f"[{account_name}] Saved to DB (stub)")

            # --- Step 4: Publish to note ---
            # TODO: note_url = await poster_run(account, post)
            note_url = "https://note.com/stub"
            logger.debug(f"[{account_name}] Published to note (stub)")

            await discord_notify.post_done(user, account, post, note_url)

        except Exception as e:
            logger.error(f"Error processing account '{account_name}': {e}")
            await discord_notify.error(user, "worker.process_user", str(e), account)

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

    # TODO: users = await get_active_users()
    users: list[dict] = []  # placeholder
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
    """
    logger.info("=== Starting reply-once pass ===")

    try:
        # TODO: users = await get_active_users()
        users: list[dict] = []  # placeholder

        for user in users:
            accounts = get_allowed_accounts(user)
            for account in accounts:
                account_name = account.get("name", "unknown")
                try:
                    # TODO: count = await reply_checker_run(user, account)
                    count = 0  # placeholder
                    logger.info(
                        f"[reply] {account_name}: processed {count} replies (stub)"
                    )
                    if count > 0:
                        await discord_notify.reply_done(user, account, count)
                except Exception as e:
                    logger.error(
                        f"[reply] Error for account '{account_name}': {e}"
                    )
                    await discord_notify.error(
                        user, "worker.run_reply_once", str(e), account
                    )

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
