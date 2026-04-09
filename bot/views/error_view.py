"""
Error log viewer: shows last 5 errors with refresh capability.
"""

from __future__ import annotations

import discord
from discord import ui
from loguru import logger

from modules import db
from bot.embeds import errors_embed


class ErrorView(ui.View):
    """Error log viewer with refresh button."""

    def __init__(self, user: dict | None = None):
        super().__init__(timeout=300)
        self.user = user

    @ui.button(
        label="更新",
        emoji="\U0001f504",
        style=discord.ButtonStyle.secondary,
        custom_id="errors:refresh",
    )
    async def refresh_button(self, interaction: discord.Interaction, button: ui.Button):
        user = self.user
        if not user:
            user = db.get_user_by_discord_id(str(interaction.user.id))
        if not user:
            await interaction.response.send_message(
                "ユーザー情報が見つかりません。", ephemeral=True
            )
            return

        await interaction.response.defer(ephemeral=True)

        logs = db.get_recent_logs(user["id"], level="error", limit=5)
        embed = errors_embed(logs)
        await interaction.edit_original_response(embed=embed, view=ErrorView(user))

    @ui.button(
        label="メニューに戻る",
        emoji="\u2b05\ufe0f",
        style=discord.ButtonStyle.secondary,
        custom_id="errors:back",
    )
    async def back_button(self, interaction: discord.Interaction, button: ui.Button):
        from bot.views.main_menu import MainMenuView
        from bot.embeds import main_menu_embed

        embed = main_menu_embed()
        await interaction.response.edit_message(embed=embed, view=MainMenuView())
