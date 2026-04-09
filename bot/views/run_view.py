"""
Manual execution view: select cycle + account, trigger worker via webhook.
"""

from __future__ import annotations

import os

import discord
import httpx
from discord import ui
from loguru import logger

from modules import db


RAILWAY_WEBHOOK_URL = os.getenv("RAILWAY_WEBHOOK_URL", "")


class RunView(ui.View):
    """Manual run controls: cycle select, account select, execute button."""

    def __init__(self, user: dict | None = None, accounts: list[dict] | None = None):
        super().__init__(timeout=300)
        self.user = user
        self.accounts = accounts or []
        self.selected_cycle: str = ""
        self.selected_account_ids: list[str] = []

        if self.accounts:
            self._add_selects()

    def _add_selects(self):
        """Add cycle and account select menus."""
        # Cycle select
        cycle_select = ui.Select(
            placeholder="サイクルを選択...",
            options=[
                discord.SelectOption(label="朝 (morning)", value="morning", emoji="\U0001f305"),
                discord.SelectOption(label="昼 (noon)", value="noon", emoji="\u2600\ufe0f"),
                discord.SelectOption(label="夜 (night)", value="night", emoji="\U0001f319"),
            ],
            custom_id="run:cycle_select",
            min_values=1,
            max_values=1,
            row=0,
        )
        cycle_select.callback = self._on_cycle_select
        self.add_item(cycle_select)

        # Account select
        acc_options = [
            discord.SelectOption(
                label="全アカウント",
                value="__all__",
                emoji="\U0001f4e6",
            )
        ]
        for acc in self.accounts:
            name = acc.get("name", "不明")
            genre = acc.get("genre", "")
            acc_options.append(
                discord.SelectOption(
                    label=f"{name}（{genre}）",
                    value=acc.get("id", ""),
                )
            )

        account_select = ui.Select(
            placeholder="アカウントを選択...",
            options=acc_options[:25],
            custom_id="run:account_select",
            min_values=1,
            max_values=1,
            row=1,
        )
        account_select.callback = self._on_account_select
        self.add_item(account_select)

    async def _on_cycle_select(self, interaction: discord.Interaction):
        values = interaction.data.get("values", [])
        self.selected_cycle = values[0] if values else ""
        cycle_labels = {"morning": "朝", "noon": "昼", "night": "夜"}
        await interaction.response.send_message(
            f"サイクル: **{cycle_labels.get(self.selected_cycle, self.selected_cycle)}** を選択しました。",
            ephemeral=True,
        )

    async def _on_account_select(self, interaction: discord.Interaction):
        self.selected_account_ids = interaction.data.get("values", [])
        if "__all__" in self.selected_account_ids:
            label = "全アカウント"
        else:
            label = ", ".join(
                acc.get("name", acc.get("id", "?")[:8])
                for acc in self.accounts
                if acc.get("id") in self.selected_account_ids
            )
        await interaction.response.send_message(
            f"アカウント: **{label}** を選択しました。",
            ephemeral=True,
        )

    @ui.button(
        label="実行",
        emoji="\u25b6\ufe0f",
        style=discord.ButtonStyle.success,
        custom_id="run:execute",
        row=2,
    )
    async def execute_button(self, interaction: discord.Interaction, button: ui.Button):
        if not self.selected_cycle:
            await interaction.response.send_message(
                "サイクルを選択してください。", ephemeral=True
            )
            return
        if not self.selected_account_ids:
            await interaction.response.send_message(
                "アカウントを選択してください。", ephemeral=True
            )
            return

        await interaction.response.defer(ephemeral=True, thinking=True)

        user = self.user
        if not user:
            user = db.get_user_by_discord_id(str(interaction.user.id))
        if not user:
            await interaction.followup.send("ユーザー情報が見つかりません。", ephemeral=True)
            return

        # Determine target account IDs
        if "__all__" in self.selected_account_ids:
            account_ids = [acc["id"] for acc in self.accounts]
        else:
            account_ids = list(self.selected_account_ids)

        # Send webhook to Railway API
        success = await _trigger_worker(
            user_id=user["id"],
            cycle=self.selected_cycle,
            account_ids=account_ids,
        )

        if success:
            cycle_labels = {"morning": "朝", "noon": "昼", "night": "夜"}
            embed = discord.Embed(
                title="\u2705 手動実行をトリガーしました",
                description=(
                    f"**サイクル**: {cycle_labels.get(self.selected_cycle, self.selected_cycle)}\n"
                    f"**対象アカウント数**: {len(account_ids)}\n\n"
                    "ワーカーがバックグラウンドで実行を開始します。\n"
                    "完了時にDiscordへ通知が届きます。"
                ),
                color=0x2ECC71,
            )
        else:
            embed = discord.Embed(
                title="\u274c 実行トリガーに失敗しました",
                description="Railway APIへのリクエストが失敗しました。しばらく後にお試しください。",
                color=0xE74C3C,
            )

        await interaction.followup.send(embed=embed, ephemeral=True)

    @ui.button(
        label="メニューに戻る",
        emoji="\u2b05\ufe0f",
        style=discord.ButtonStyle.secondary,
        custom_id="run:back",
        row=3,
    )
    async def back_button(self, interaction: discord.Interaction, button: ui.Button):
        from bot.views.main_menu import MainMenuView
        from bot.embeds import main_menu_embed

        embed = main_menu_embed()
        await interaction.response.edit_message(embed=embed, view=MainMenuView())


async def _trigger_worker(
    user_id: str,
    cycle: str,
    account_ids: list[str],
) -> bool:
    """Send a webhook to the Railway API to trigger the worker."""
    if not RAILWAY_WEBHOOK_URL:
        logger.warning("RAILWAY_WEBHOOK_URL is not set - cannot trigger worker")
        return False

    payload = {
        "user_id": user_id,
        "cycle": cycle,
        "account_ids": account_ids,
        "manual": True,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(RAILWAY_WEBHOOK_URL, json=payload)
            resp.raise_for_status()
            logger.info(
                f"Worker triggered: cycle={cycle}, accounts={len(account_ids)}, "
                f"status={resp.status_code}"
            )
            return True
    except httpx.HTTPStatusError as e:
        logger.error(
            f"Railway webhook HTTP error {e.response.status_code}: {e.response.text}"
        )
        return False
    except httpx.RequestError as e:
        logger.error(f"Railway webhook request failed: {e}")
        return False
