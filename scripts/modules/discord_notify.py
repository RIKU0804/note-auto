"""Discord Webhook notification module.

Each user has their own webhook URL stored in Supabase (users.discord_webhook_url).
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from loguru import logger

JST = timezone(timedelta(hours=9))


async def _send(webhook_url: str, embed: dict) -> None:
    if not webhook_url:
        logger.warning("No Discord webhook URL configured — skipping notification")
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook_url, json={"embeds": [embed]})
            resp.raise_for_status()
    except Exception as e:
        logger.error("Discord webhook failed: {}", e)


def _jst_now() -> str:
    return datetime.now(JST).strftime("%Y-%m-%d %H:%M JST")


def _footer() -> dict:
    return {"text": _jst_now()}


def _ts() -> str:
    return datetime.now(timezone.utc).isoformat()


async def cycle_start(user: dict, cycle: str, account_count: int) -> None:
    """Notify that a cycle is starting."""
    await _send(user.get("discord_webhook_url"), {
        "title": f"サイクル開始: {cycle}",
        "description": f"対象アカウント数: **{account_count}**",
        "color": 0x3498DB,
        "timestamp": _ts(),
        "footer": _footer(),
    })


async def tweet_done(user: dict, account: dict, post: dict, tweet_url: str) -> None:
    """Notify successful X post."""
    tweet_preview = post.get("tweet_text", "")[:100]
    if len(post.get("tweet_text", "")) > 100:
        tweet_preview += "…"

    desc = (
        f"**アカウント**: @{account.get('x_username', account.get('name', 'unknown'))}\n"
        f"**投稿内容**: {tweet_preview}"
    )
    if tweet_url:
        desc += f"\n**URL**: {tweet_url}"

    await _send(user.get("discord_webhook_url"), {
        "title": "投稿完了",
        "description": desc,
        "color": 0x2ECC71,
        "timestamp": _ts(),
        "footer": _footer(),
    })


async def error(user: dict, module: str, message: str, account: Optional[dict] = None) -> None:
    """Notify an error occurred."""
    desc = f"**モジュール**: {module}\n**エラー**: {message}"
    if account:
        desc += f"\n**アカウント**: {account.get('name', 'unknown')}"

    await _send(user.get("discord_webhook_url"), {
        "title": "エラー発生",
        "description": desc,
        "color": 0xE74C3C,
        "timestamp": _ts(),
        "footer": _footer(),
    })
