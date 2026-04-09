"""
Control view: stop / resume accounts via select menu + buttons.
"""

from __future__ import annotations

import discord
from discord import ui
from loguru import logger

from modules import db


class ControlView(ui.View):
    """Account pause/resume controls with a select menu."""

    def __init__(self, user: dict | None = None, accounts: list[dict] | None = None):
        super().__init__(timeout=300)
        self.user = user
        self.accounts = accounts or []
        self.selected_account_ids: list[str] = []

        # Dynamically build the select menu if accounts are available
        if self.accounts:
            self._add_account_select()

    def _add_account_select(self):
        """Add account select menu with current account list."""
        options = [
            discord.SelectOption(
                label="全アカウント",
                value="__all__",
                description="全てのアカウントを対象にする",
                emoji="\U0001f4e6",
            )
        ]
        for acc in self.accounts:
            name = acc.get("name", "不明")
            genre = acc.get("genre", "")
            is_active = acc.get("is_active", False)
            status_text = "稼働中" if is_active else "停止中"
            options.append(
                discord.SelectOption(
                    label=f"{name}（{genre}）",
                    value=acc.get("id", ""),
                    description=status_text,
                    emoji="\u2705" if is_active else "\u23f8\ufe0f",
                )
            )

        select = ui.Select(
            placeholder="アカウントを選択...",
            options=options[:25],  # Discord limit
            custom_id="control:account_select",
            min_values=1,
            max_values=1,
        )
        select.callback = self._on_account_select
        self.add_item(select)

    async def _on_account_select(self, interaction: discord.Interaction):
        """Handle account selection."""
        self.selected_account_ids = interaction.data.get("values", [])
        selected_label = (
            "全アカウント"
            if "__all__" in self.selected_account_ids
            else ", ".join(
                acc.get("name", acc.get("id", "?")[:8])
                for acc in self.accounts
                if acc.get("id") in self.selected_account_ids
            )
        )
        await interaction.response.send_message(
            f"選択中: **{selected_label}**\n"
            "下のボタンで停止・再開を操作してください。",
            ephemeral=True,
        )

    @ui.button(
        label="停止",
        emoji="\u23f8\ufe0f",
        style=discord.ButtonStyle.danger,
        custom_id="control:pause",
        row=2,
    )
    async def pause_button(self, interaction: discord.Interaction, button: ui.Button):
        if not self.selected_account_ids:
            await interaction.response.send_message(
                "先にアカウントを選択してください。", ephemeral=True
            )
            return

        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await self._set_active(False)
        await interaction.followup.send(
            embed=_result_embed("停止", results), ephemeral=True
        )

    @ui.button(
        label="再開",
        emoji="\u25b6\ufe0f",
        style=discord.ButtonStyle.success,
        custom_id="control:resume",
        row=2,
    )
    async def resume_button(self, interaction: discord.Interaction, button: ui.Button):
        if not self.selected_account_ids:
            await interaction.response.send_message(
                "先にアカウントを選択してください。", ephemeral=True
            )
            return

        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await self._set_active(True)
        await interaction.followup.send(
            embed=_result_embed("再開", results), ephemeral=True
        )

    @ui.button(
        label="メニューに戻る",
        emoji="\u2b05\ufe0f",
        style=discord.ButtonStyle.secondary,
        custom_id="control:back",
        row=3,
    )
    async def back_button(self, interaction: discord.Interaction, button: ui.Button):
        from bot.views.main_menu import MainMenuView
        from bot.embeds import main_menu_embed

        embed = main_menu_embed()
        await interaction.response.edit_message(embed=embed, view=MainMenuView())

    # ----- internal -----

    async def _set_active(self, is_active: bool) -> list[str]:
        """Set is_active for selected accounts. Returns list of result strings."""
        target_ids: list[str] = []
        if "__all__" in self.selected_account_ids:
            target_ids = [acc["id"] for acc in self.accounts]
        else:
            target_ids = list(self.selected_account_ids)

        results: list[str] = []
        for acc_id in target_ids:
            try:
                db.set_account_active(acc_id, is_active)
                acc_name = next(
                    (a.get("name", acc_id[:8]) for a in self.accounts if a.get("id") == acc_id),
                    acc_id[:8],
                )
                action = "再開" if is_active else "停止"
                results.append(f"\u2705 {acc_name}: {action}しました")
                logger.info(f"Account {acc_id} set is_active={is_active}")
            except Exception as e:
                results.append(f"\u274c {acc_id[:8]}: エラー - {e}")
                logger.error(f"Failed to set account {acc_id} active={is_active}: {e}")

        return results


def _result_embed(action: str, results: list[str]) -> discord.Embed:
    """Build an embed showing the results of a bulk operation."""
    embed = discord.Embed(
        title=f"アカウント{action}結果",
        description="\n".join(results) if results else "対象アカウントがありません。",
        color=0x2ECC71 if action == "再開" else 0xE74C3C,
    )
    return embed
