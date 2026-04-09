"""Supabase database wrapper for X × note automation SaaS.

Uses service_role key (server-side, bypasses RLS).
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

from loguru import logger
from supabase import Client, create_client

# ---------------------------------------------------------------------------
# Client initialisation
# ---------------------------------------------------------------------------

_url: str = os.environ["SUPABASE_URL"]
_key: str = os.environ["SUPABASE_KEY"]
supabase: Client = create_client(_url, _key)


# ---------------------------------------------------------------------------
# Users / Plans
# ---------------------------------------------------------------------------

def get_active_users() -> list[dict]:
    """Get all active users with their plan info."""
    try:
        resp = supabase.table("users").select("*").eq("is_active", True).execute()
        return resp.data
    except Exception as e:
        logger.error(f"Failed to get active users: {e}")
        return []


def get_plan_limits(plan: str) -> dict:
    """Get plan limits for a given plan tier."""
    try:
        resp = (
            supabase.table("plan_limits")
            .select("*")
            .eq("plan", plan)
            .single()
            .execute()
        )
        return resp.data
    except Exception as e:
        logger.error(f"Failed to get plan limits for '{plan}': {e}")
        return {}


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

def get_accounts(user_id: str) -> list[dict]:
    """Get all active accounts for a user."""
    try:
        resp = (
            supabase.table("accounts")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .execute()
        )
        return resp.data
    except Exception as e:
        logger.error(f"Failed to get accounts for user {user_id}: {e}")
        return []


def get_decrypted_account(account_id: str) -> dict:
    """Get account with decrypted passwords via Supabase Vault.

    For now, returns the account row as-is (Vault integration TBD).
    """
    try:
        resp = (
            supabase.table("accounts")
            .select("*")
            .eq("id", account_id)
            .single()
            .execute()
        )
        return resp.data
    except Exception as e:
        logger.error(f"Failed to get decrypted account {account_id}: {e}")
        return {}


def set_account_active(account_id: str, is_active: bool) -> None:
    """Enable or disable an account."""
    try:
        supabase.table("accounts").update({"is_active": is_active}).eq(
            "id", account_id
        ).execute()
        logger.info(f"Account {account_id} is_active set to {is_active}")
    except Exception as e:
        logger.error(f"Failed to set account {account_id} active={is_active}: {e}")


# ---------------------------------------------------------------------------
# Research
# ---------------------------------------------------------------------------

def save_research(
    user_id: str, account_id: str, cycle: str, tweets: list[dict]
) -> None:
    """Save scraped tweet data to research table (upsert by tweet_id)."""
    try:
        rows = [
            {
                "user_id": user_id,
                "account_id": account_id,
                "cycle": cycle,
                "tweet_id": t["tweet_id"],
                "author": t.get("author"),
                "content": t.get("content"),
                "metrics": t.get("metrics"),
                "scraped_at": datetime.now(timezone.utc).isoformat(),
            }
            for t in tweets
        ]
        supabase.table("research").upsert(
            rows, on_conflict="tweet_id"
        ).execute()
        logger.info(
            f"Saved {len(rows)} research tweets for account {account_id}, cycle {cycle}"
        )
    except Exception as e:
        logger.error(f"Failed to save research for account {account_id}: {e}")


# ---------------------------------------------------------------------------
# Posts
# ---------------------------------------------------------------------------

def save_post(user_id: str, account_id: str, post: dict) -> str:
    """Save a generated post, return post ID."""
    try:
        row = {
            "user_id": user_id,
            "account_id": account_id,
            "content": post.get("content"),
            "media_urls": post.get("media_urls"),
            "status": "queued",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        resp = supabase.table("posts").insert(row).execute()
        post_id = resp.data[0]["id"]
        logger.info(f"Saved post {post_id} for account {account_id}")
        return post_id
    except Exception as e:
        logger.error(f"Failed to save post for account {account_id}: {e}")
        return ""


def get_queued_post(account_id: str) -> dict | None:
    """Get the next queued post for an account."""
    try:
        resp = (
            supabase.table("posts")
            .select("*")
            .eq("account_id", account_id)
            .eq("status", "queued")
            .order("created_at")
            .limit(1)
            .execute()
        )
        return resp.data[0] if resp.data else None
    except Exception as e:
        logger.error(f"Failed to get queued post for account {account_id}: {e}")
        return None


def update_post_status(
    post_id: str,
    status: str,
    note_url: str = None,
    x_tweet_id: str = None,
    error_message: str = None,
) -> None:
    """Update post status after posting attempt."""
    try:
        updates: dict = {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}
        if note_url is not None:
            updates["note_url"] = note_url
        if x_tweet_id is not None:
            updates["x_tweet_id"] = x_tweet_id
        if error_message is not None:
            updates["error_message"] = error_message

        supabase.table("posts").update(updates).eq("id", post_id).execute()
        logger.info(f"Post {post_id} status updated to '{status}'")
    except Exception as e:
        logger.error(f"Failed to update post {post_id} status: {e}")


def get_recent_posts(user_id: str, limit: int = 10) -> list[dict]:
    """Get recent posts for a user, newest first."""
    try:
        resp = (
            supabase.table("posts")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return resp.data
    except Exception as e:
        logger.error(f"Failed to get recent posts for user {user_id}: {e}")
        return []


# ---------------------------------------------------------------------------
# Replies
# ---------------------------------------------------------------------------

def get_unresponded_replies(account_id: str) -> list[dict]:
    """Get replies that haven't been responded to yet."""
    try:
        resp = (
            supabase.table("replies")
            .select("*")
            .eq("account_id", account_id)
            .is_("responded_at", "null")
            .eq("is_spam", False)
            .execute()
        )
        return resp.data
    except Exception as e:
        logger.error(
            f"Failed to get unresponded replies for account {account_id}: {e}"
        )
        return []


def save_reply(user_id: str, account_id: str, reply: dict) -> None:
    """Save a detected reply (upsert by reply_tweet_id)."""
    try:
        row = {
            "user_id": user_id,
            "account_id": account_id,
            "reply_tweet_id": reply["reply_tweet_id"],
            "author": reply.get("author"),
            "content": reply.get("content"),
            "parent_tweet_id": reply.get("parent_tweet_id"),
            "detected_at": datetime.now(timezone.utc).isoformat(),
            "is_spam": False,
        }
        supabase.table("replies").upsert(
            row, on_conflict="reply_tweet_id"
        ).execute()
        logger.info(
            f"Saved reply {reply['reply_tweet_id']} for account {account_id}"
        )
    except Exception as e:
        logger.error(f"Failed to save reply for account {account_id}: {e}")


def mark_reply_responded(reply_id: str, response_text: str) -> None:
    """Mark a reply as responded."""
    try:
        supabase.table("replies").update(
            {
                "responded_at": datetime.now(timezone.utc).isoformat(),
                "response_text": response_text,
            }
        ).eq("id", reply_id).execute()
        logger.info(f"Reply {reply_id} marked as responded")
    except Exception as e:
        logger.error(f"Failed to mark reply {reply_id} as responded: {e}")


def mark_reply_spam(reply_id: str) -> None:
    """Mark a reply as spam."""
    try:
        supabase.table("replies").update({"is_spam": True}).eq(
            "id", reply_id
        ).execute()
        logger.info(f"Reply {reply_id} marked as spam")
    except Exception as e:
        logger.error(f"Failed to mark reply {reply_id} as spam: {e}")


# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------

def save_log(
    user_id: str,
    level: str,
    module: str,
    message: str,
    account_id: str = None,
) -> None:
    """Save a log entry."""
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
        logger.error(f"Failed to save log entry: {e}")


def get_recent_logs(
    user_id: str, level: str = None, limit: int = 5
) -> list[dict]:
    """Get recent logs, optionally filtered by level."""
    try:
        query = (
            supabase.table("logs")
            .select("*")
            .eq("user_id", user_id)
        )
        if level is not None:
            query = query.eq("level", level)
        resp = query.order("created_at", desc=True).limit(limit).execute()
        return resp.data
    except Exception as e:
        logger.error(f"Failed to get recent logs for user {user_id}: {e}")
        return []


# ---------------------------------------------------------------------------
# Discord lookup
# ---------------------------------------------------------------------------

def get_user_by_discord_id(discord_id: str) -> dict | None:
    """Find user by their Discord user ID."""
    try:
        resp = (
            supabase.table("users")
            .select("*")
            .eq("discord_id", discord_id)
            .single()
            .execute()
        )
        return resp.data
    except Exception as e:
        logger.error(f"Failed to find user by discord_id {discord_id}: {e}")
        return None
