"""
Discord Webhook notification module.
Each user has their own webhook URL stored in Supabase (user["discord_webhook_url"]).
"""

import httpx
from loguru import logger
from datetime import datetime, timezone, timedelta

JST = timezone(timedelta(hours=9))


async def _send_webhook(webhook_url: str, embed: dict):
    """Send an embed to a Discord webhook URL."""
    if not webhook_url:
        logger.warning("No Discord webhook URL configured — skipping notification")
        return

    payload = {"embeds": [embed]}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook_url, json=payload)
            resp.raise_for_status()
            logger.debug("Discord webhook sent successfully")
    except httpx.HTTPStatusError as e:
        logger.error(f"Discord webhook HTTP error {e.response.status_code}: {e.response.text}")
    except httpx.RequestError as e:
        logger.error(f"Discord webhook request failed: {e}")
    except Exception as e:
        # Catch-all for JSON serialization errors, unexpected SSL issues,
        # etc. Notifications are best-effort — they must never crash the
        # worker.
        logger.error(f"Discord webhook unexpected error: {e}")


def _now_jst_str() -> str:
    return datetime.now(JST).strftime("%Y-%m-%d %H:%M:%S JST")


async def cycle_start(user: dict, cycle: str, account_count: int):
    """Notify that a cycle is starting."""
    embed = {
        "title": f"サイクル開始: {cycle}",
        "description": (
            f"対象アカウント数: **{account_count}**\n"
            f"ユーザー: {user.get('email', user.get('id', 'unknown'))}"
        ),
        "color": 0x3498DB,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "footer": {"text": _now_jst_str()},
    }
    await _send_webhook(user.get("discord_webhook_url"), embed)


async def post_done(user: dict, account: dict, post: dict, note_url: str):
    """Notify successful post."""
    embed = {
        "title": "投稿完了",
        "description": (
            f"**アカウント**: {account.get('name', 'unknown')}\n"
            f"**タイトル**: {post.get('title', '(無題)')}\n"
            f"**URL**: {note_url}\n"
            f"**サイクル**: {post.get('cycle', '-')}"
        ),
        "color": 0x2ECC71,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "footer": {"text": _now_jst_str()},
    }
    await _send_webhook(user.get("discord_webhook_url"), embed)


async def reply_done(user: dict, account: dict, count: int):
    """Notify reply processing complete."""
    embed = {
        "title": "リプライ処理完了",
        "description": (
            f"**アカウント**: {account.get('name', 'unknown')}\n"
            f"**処理件数**: {count}"
        ),
        "color": 0x9B59B6,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "footer": {"text": _now_jst_str()},
    }
    await _send_webhook(user.get("discord_webhook_url"), embed)


async def error(user: dict, module: str, message: str, account: dict = None):
    """Notify an error occurred."""
    desc = f"**モジュール**: {module}\n**エラー**: {message}"
    if account:
        desc += f"\n**アカウント**: {account.get('name', 'unknown')}"

    embed = {
        "title": "エラー発生",
        "description": desc,
        "color": 0xE74C3C,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "footer": {"text": _now_jst_str()},
    }
    await _send_webhook(user.get("discord_webhook_url"), embed)


async def daily_summary(user: dict, stats: dict):
    """Send daily summary."""
    embed = {
        "title": "日次サマリー",
        "description": (
            f"**総投稿数**: {stats.get('total_posts', 0)}\n"
            f"**成功**: {stats.get('successful', 0)}\n"
            f"**失敗**: {stats.get('failed', 0)}\n"
            f"**リプライ処理数**: {stats.get('replies_processed', 0)}"
        ),
        "color": 0xF1C40F,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "footer": {"text": _now_jst_str()},
    }
    await _send_webhook(user.get("discord_webhook_url"), embed)
