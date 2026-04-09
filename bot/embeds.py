"""
Helper functions to create Discord embeds for the bot UI.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta

import discord

JST = timezone(timedelta(hours=9))


def _now_jst() -> datetime:
    return datetime.now(JST)


def _footer_text() -> str:
    return _now_jst().strftime("%Y/%m/%d %H:%M JST")


# ---------------------------------------------------------------------------
# Main menu
# ---------------------------------------------------------------------------

def main_menu_embed() -> discord.Embed:
    """Build the main menu embed."""
    embed = discord.Embed(
        title="X x note 自動化 コントロールパネル",
        description=(
            "ボタンを押して各機能にアクセスしてください。\n\n"
            "**機能一覧**\n"
            "- ステータス確認: アカウントの稼働状況を表示\n"
            "- アカウント管理: アカウントの停止・再開\n"
            "- 手動実行: 投稿サイクルを手動でトリガー\n"
            "- 停止・再開: アカウントの有効/無効を切り替え\n"
            "- 投稿一覧: 過去の投稿履歴を閲覧\n"
            "- エラーログ: 直近のエラーを確認"
        ),
        color=0x3498DB,
    )
    embed.set_footer(text=_footer_text())
    return embed


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

_CYCLE_LABELS = {"morning": "朝", "noon": "昼", "night": "夜"}
_STATUS_EMOJI = {
    "published": "\u2705",   # check mark
    "queued": "\u23f3",      # hourglass
    "failed": "\u274c",      # cross
}


def status_embed(
    user: dict,
    accounts: list[dict],
    today_posts: list[dict],
) -> discord.Embed:
    """Build the status embed showing per-account status for today."""
    plan = user.get("plan", "free").capitalize()
    now_str = _now_jst().strftime("%Y/%m/%d %H:%M")

    embed = discord.Embed(
        title=f"\U0001f4ca ステータス  {now_str}  [{plan}プラン]",
        color=0x2ECC71,
    )

    if not accounts:
        embed.description = "登録されたアカウントはありません。"
        embed.set_footer(text=_footer_text())
        return embed

    # Build a lookup: account_id -> {cycle: status}
    posts_by_account: dict[str, dict[str, str]] = {}
    for post in today_posts:
        aid = post.get("account_id", "")
        cycle = post.get("cycle", "")
        status = post.get("status", "queued")
        posts_by_account.setdefault(aid, {})[cycle] = status

    lines: list[str] = []
    for acc in accounts:
        acc_id = acc.get("id", "")
        name = acc.get("name", "不明")
        genre = acc.get("genre", "")
        is_active = acc.get("is_active", False)
        active_label = "\u2705 稼働中" if is_active else "\u23f8\ufe0f 停止中"

        cycle_statuses = posts_by_account.get(acc_id, {})
        cycle_parts: list[str] = []
        for cycle_key in ("morning", "noon", "night"):
            label = _CYCLE_LABELS[cycle_key]
            emoji = _STATUS_EMOJI.get(cycle_statuses.get(cycle_key, ""), "\u23f3")
            cycle_parts.append(f"{label}{emoji}")

        cycle_line = " ".join(cycle_parts)
        lines.append(
            f"\U0001f33f **{name}**（{genre}）  {active_label}\n"
            f"   本日: {cycle_line}"
        )

    embed.description = "\n\n".join(lines)
    embed.set_footer(text=_footer_text())
    return embed


# ---------------------------------------------------------------------------
# Posts list
# ---------------------------------------------------------------------------

def posts_embed(
    posts: list[dict],
    page: int,
    total_pages: int,
) -> discord.Embed:
    """Build a paginated post-list embed."""
    embed = discord.Embed(
        title=f"\U0001f4cb 投稿一覧  ({page}/{total_pages})",
        color=0xF1C40F,
    )

    if not posts:
        embed.description = "投稿はありません。"
        embed.set_footer(text=_footer_text())
        return embed

    lines: list[str] = []
    for p in posts:
        status = p.get("status", "unknown")
        emoji = _STATUS_EMOJI.get(status, "\u2753")
        account_name = p.get("account_name", p.get("account_id", "?")[:8])
        cycle = _CYCLE_LABELS.get(p.get("cycle", ""), p.get("cycle", "-"))
        title = p.get("title", p.get("content", "(無題)"))
        if len(title) > 40:
            title = title[:37] + "..."

        note_url = p.get("note_url", "")
        error_msg = p.get("error_message", "")

        detail = note_url if note_url else (error_msg if error_msg else "-")

        created = p.get("created_at", "")
        if created:
            try:
                dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                created = dt.astimezone(JST).strftime("%m/%d %H:%M")
            except (ValueError, TypeError):
                created = created[:16]

        lines.append(
            f"{emoji} **{account_name}** [{cycle}] {title}\n"
            f"   {created}  {detail}"
        )

    embed.description = "\n\n".join(lines)
    embed.set_footer(text=_footer_text())
    return embed


# ---------------------------------------------------------------------------
# Error logs
# ---------------------------------------------------------------------------

def errors_embed(logs: list[dict]) -> discord.Embed:
    """Build the error-log embed."""
    embed = discord.Embed(
        title="\u274c エラーログ（直近5件）",
        color=0xE74C3C,
    )

    if not logs:
        embed.description = "エラーはありません。"
        embed.set_footer(text=_footer_text())
        return embed

    lines: list[str] = []
    for log in logs:
        ts = log.get("created_at", "")
        if ts:
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                ts = dt.astimezone(JST).strftime("%m/%d %H:%M")
            except (ValueError, TypeError):
                ts = ts[:16]

        module = log.get("module", "-")
        account_id = log.get("account_id", "")
        account_label = account_id[:8] if account_id else "全体"
        message = log.get("message", "(メッセージなし)")

        lines.append(
            f"**{ts}** | `{module}` | {account_label}\n"
            f"> {message}"
        )

    embed.description = "\n\n".join(lines)
    embed.set_footer(text=_footer_text())
    return embed
