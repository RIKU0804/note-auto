"""Supabase database wrapper. Uses service_role key (bypasses RLS)."""

from __future__ import annotations

import os
from datetime import datetime, timezone

from loguru import logger
from supabase import Client, create_client

_url: str = os.environ["SUPABASE_URL"]
_key: str = os.environ["SUPABASE_KEY"]
supabase: Client = create_client(_url, _key)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def get_active_users() -> list[dict]:
    try:
        return supabase.table("users").select("*").eq("is_active", True).execute().data
    except Exception as e:
        logger.error("Failed to get active users: {}", e)
        return []


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

def get_accounts(user_id: str) -> list[dict]:
    try:
        return (
            supabase.table("accounts")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .execute()
            .data
        )
    except Exception as e:
        logger.error("Failed to get accounts for user {}: {}", user_id, e)
        return []


# ---------------------------------------------------------------------------
# Research
# ---------------------------------------------------------------------------

def save_research(user_id: str, account_id: str, cycle: str, tweets: list[dict]) -> None:
    """Save scraped tweet data (upsert by user_id+tweet_id)."""
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        rows = [
            {
                "user_id": user_id,
                "account_id": account_id,
                "cycle": cycle,
                "tweet_id": t.get("tweet_id"),
                "tweet_text": t.get("tweet_text", ""),
                "likes": int(t.get("likes", 0) or 0),
                "retweets": int(t.get("retweets", 0) or 0),
                "collected_at": now_iso,
            }
            for t in tweets
        ]
        if rows:
            supabase.table("research").upsert(rows, on_conflict="user_id,tweet_id").execute()
            logger.info("Saved {} research tweets for account {}", len(rows), account_id)
    except Exception as e:
        logger.error("Failed to save research for account {}: {}", account_id, e)


# ---------------------------------------------------------------------------
# Posts
# ---------------------------------------------------------------------------

def save_post(user_id: str, account_id: str, post: dict) -> str:
    """Save a generated post, return post ID."""
    try:
        row = {
            "user_id": user_id,
            "account_id": account_id,
            "cycle": post.get("cycle", ""),
            "tweet_text": post.get("tweet_text", ""),
            "status": "queued",
        }
        resp = supabase.table("posts").insert(row).execute()
        post_id = resp.data[0]["id"]
        logger.info("Saved post {} for account {}", post_id, account_id)
        return post_id
    except Exception as e:
        logger.error("Failed to save post for account {}: {}", account_id, e)
        return ""


def update_post_status(
    post_id: str,
    status: str,
    x_tweet_id: str | None = None,
    error_message: str | None = None,
) -> None:
    try:
        updates: dict = {"status": status}
        if x_tweet_id is not None:
            updates["x_tweet_id"] = x_tweet_id
        if error_message is not None:
            updates["error_message"] = error_message
        if status == "posted":
            updates["posted_at"] = datetime.now(timezone.utc).isoformat()
        supabase.table("posts").update(updates).eq("id", post_id).execute()
        logger.info("Post {} status → '{}'", post_id, status)
    except Exception as e:
        logger.error("Failed to update post {} status: {}", post_id, e)


def get_recent_posts(user_id: str, limit: int = 10) -> list[dict]:
    try:
        return (
            supabase.table("posts")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data
        )
    except Exception as e:
        logger.error("Failed to get recent posts for user {}: {}", user_id, e)
        return []


# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------

def save_log(
    user_id: str,
    level: str,
    module: str,
    message: str,
    account_id: str | None = None,
) -> None:
    try:
        row: dict = {
            "user_id": user_id,
            "level": level,
            "module": module,
            "message": message,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if account_id is not None:
            row["account_id"] = account_id
        supabase.table("logs").insert(row).execute()
    except Exception as e:
        logger.error("Failed to save log: {}", e)
