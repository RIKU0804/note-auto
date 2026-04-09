"""
Status view: shows per-account status with a refresh button.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta

import discord
from discord import ui
from loguru import logger

from modules import db
from bot.embeds import status_embed

JST = timezone(timedelta(hours=9))


class StatusView(ui.View):
    """Displays account status with a refresh button."""

    def __init__(self, user: dict | None = None):
        super().__init__(timeout=300)
        self.user = user

    @ui.button(
        label="更新",
        emoji="\U0001f504",
        style=discord.ButtonStyle.secondary,
        custom_id="status:refresh",
    )
    async def refresh_button(self, interaction: discord.Interaction, button: ui.Button):
        # Re-lookup user in case it's a persistent view reload
        user = self.user
        if not user:
            user = db.get_user_by_discord_id(str(interaction.user.id))
        if not user:
            await interaction.response.send_message(
                "ユーザー情報が見つかりません。", ephemeral=True
            )
            return

        await interaction.response.defer(ephemeral=True)

        accounts = db.get_accounts(user["id"])
        today_posts = _get_today_posts(user["id"])
        embed = status_embed(user, accounts, today_posts)
        await interaction.edit_original_response(embed=embed, view=StatusView(user))

    @ui.button(
        label="メニューに戻る",
        emoji="\u2b05\ufe0f",
        style=discord.ButtonStyle.secondary,
        custom_id="status:back",
    )
    async def back_button(self, interaction: discord.Interaction, button: ui.Button):
        from bot.views.main_menu import MainMenuView
        from bot.embeds import main_menu_embed

        embed = main_menu_embed()
        await interaction.response.edit_message(embed=embed, view=MainMenuView())


def _get_today_posts(user_id: str) -> list[dict]:
    """Fetch today's posts for the user."""
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
