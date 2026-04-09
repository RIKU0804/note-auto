"""
Main menu view with 6 navigation buttons.
"""

from __future__ import annotations

import discord
from discord import ui
from loguru import logger

from modules import db
from bot.embeds import status_embed, errors_embed, main_menu_embed
from bot.views.status_view import StatusView
from bot.views.control_view import ControlView
from bot.views.run_view import RunView
from bot.views.posts_view import PostsView
from bot.views.error_view import ErrorView


def _user_not_found_embed() -> discord.Embed:
    return discord.Embed(
        title="ユーザー未登録",
        description=(
            "あなたのDiscordアカウントはまだ登録されていません。\n"
            "ダッシュボードからDiscord連携を設定してください。"
        ),
        color=0xE74C3C,
    )


class MainMenuView(ui.View):
    """Persistent main menu with 6 feature buttons."""

    def __init__(self):
        super().__init__(timeout=None)

    # ----- Status -----
    @ui.button(
        label="ステータス確認",
        emoji="\U0001f4ca",
        style=discord.ButtonStyle.primary,
        custom_id="main_menu:status",
        row=0,
    )
    async def status_button(self, interaction: discord.Interaction, button: ui.Button):
        user = db.get_user_by_discord_id(str(interaction.user.id))
        if not user:
            await interaction.response.send_message(
                embed=_user_not_found_embed(), ephemeral=True
            )
            return

        await interaction.response.defer(ephemeral=True, thinking=True)

        accounts = db.get_accounts(user["id"])
        today_posts = _get_today_posts(user["id"])
        embed = status_embed(user, accounts, today_posts)
        await interaction.followup.send(embed=embed, view=StatusView(user), ephemeral=True)

    # ----- Account management -----
    @ui.button(
        label="アカウント管理",
        emoji="\u2699\ufe0f",
        style=discord.ButtonStyle.secondary,
        custom_id="main_menu:account",
        row=0,
    )
    async def account_button(self, interaction: discord.Interaction, button: ui.Button):
        user = db.get_user_by_discord_id(str(interaction.user.id))
        if not user:
            await interaction.response.send_message(
                embed=_user_not_found_embed(), ephemeral=True
            )
            return

        await interaction.response.defer(ephemeral=True, thinking=True)

        accounts = db.get_accounts(user["id"])
        view = ControlView(user, accounts)
        embed = discord.Embed(
            title="\u2699\ufe0f アカウント管理",
            description="アカウントを選択して停止・再開を操作してください。",
            color=0x9B59B6,
        )
        await interaction.followup.send(embed=embed, view=view, ephemeral=True)

    # ----- Manual run -----
    @ui.button(
        label="手動実行",
        emoji="\u25b6\ufe0f",
        style=discord.ButtonStyle.success,
        custom_id="main_menu:run",
        row=0,
    )
    async def run_button(self, interaction: discord.Interaction, button: ui.Button):
        user = db.get_user_by_discord_id(str(interaction.user.id))
        if not user:
            await interaction.response.send_message(
                embed=_user_not_found_embed(), ephemeral=True
            )
            return

        await interaction.response.defer(ephemeral=True, thinking=True)

        accounts = db.get_accounts(user["id"])
        view = RunView(user, accounts)
        embed = discord.Embed(
            title="\u25b6\ufe0f 手動実行",
            description="サイクルとアカウントを選択して実行してください。",
            color=0x2ECC71,
        )
        await interaction.followup.send(embed=embed, view=view, ephemeral=True)

    # ----- Pause / Resume -----
    @ui.button(
        label="停止・再開",
        emoji="\u23f8\ufe0f",
        style=discord.ButtonStyle.secondary,
        custom_id="main_menu:pause",
        row=1,
    )
    async def pause_button(self, interaction: discord.Interaction, button: ui.Button):
        user = db.get_user_by_discord_id(str(interaction.user.id))
        if not user:
            await interaction.response.send_message(
                embed=_user_not_found_embed(), ephemeral=True
            )
            return

        await interaction.response.defer(ephemeral=True, thinking=True)

        accounts = db.get_accounts(user["id"])
        view = ControlView(user, accounts)
        embed = discord.Embed(
            title="\u23f8\ufe0f 停止・再開",
            description="アカウントを選択して操作してください。",
            color=0xF39C12,
        )
        await interaction.followup.send(embed=embed, view=view, ephemeral=True)

    # ----- Post history -----
    @ui.button(
        label="投稿一覧",
        emoji="\U0001f4cb",
        style=discord.ButtonStyle.primary,
        custom_id="main_menu:posts",
        row=1,
    )
    async def posts_button(self, interaction: discord.Interaction, button: ui.Button):
        user = db.get_user_by_discord_id(str(interaction.user.id))
        if not user:
            await interaction.response.send_message(
                embed=_user_not_found_embed(), ephemeral=True
            )
            return

        await interaction.response.defer(ephemeral=True, thinking=True)

        view = PostsView(user)
        embed = await view.build_embed()
        await interaction.followup.send(embed=embed, view=view, ephemeral=True)

    # ----- Error log -----
    @ui.button(
        label="エラーログ",
        emoji="\u274c",
        style=discord.ButtonStyle.danger,
        custom_id="main_menu:errors",
        row=1,
    )
    async def errors_button(self, interaction: discord.Interaction, button: ui.Button):
        user = db.get_user_by_discord_id(str(interaction.user.id))
        if not user:
            await interaction.response.send_message(
                embed=_user_not_found_embed(), ephemeral=True
            )
            return

        await interaction.response.defer(ephemeral=True, thinking=True)

        logs = db.get_recent_logs(user["id"], level="error", limit=5)
        embed = errors_embed(logs)
        await interaction.followup.send(embed=embed, view=ErrorView(user), ephemeral=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_today_posts(user_id: str) -> list[dict]:
    """Fetch today's posts for the user (all accounts, all cycles)."""
    from datetime import datetime, timezone, timedelta

    JST = timezone(timedelta(hours=9))
    now = datetime.now(JST)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_start_utc = today_start.astimezone(timezone.utc).isoformat()

    try:
        resp = (
            db.supabase.table("posts")
            .select("*")
            .eq("user_id", user_id)
            .gte("created_at", today_start_utc)
            .execute()
        )
        return resp.data
    except Exception as e:
        logger.error(f"Failed to fetch today's posts for user {user_id}: {e}")
        return []
