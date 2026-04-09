"""
Post history view with pagination and retry-failed button.
"""

from __future__ import annotations

import math

import discord
from discord import ui
from loguru import logger

from modules import db
from bot.embeds import posts_embed

POSTS_PER_PAGE = 10


class PostsView(ui.View):
    """Paginated post history viewer."""

    def __init__(self, user: dict | None = None, page: int = 1):
        super().__init__(timeout=300)
        self.user = user
        self.page = page
        self.total_pages = 1
        self._update_button_states()

    def _update_button_states(self):
        """Enable/disable pagination buttons based on current page."""
        for item in self.children:
            if isinstance(item, ui.Button):
                if item.custom_id == "posts:prev":
                    item.disabled = self.page <= 1
                elif item.custom_id == "posts:next":
                    item.disabled = self.page >= self.total_pages

    async def build_embed(self) -> discord.Embed:
        """Fetch posts and build the embed for the current page."""
        if not self.user:
            return discord.Embed(
                title="エラー",
                description="ユーザー情報がありません。",
                color=0xE74C3C,
            )

        user_id = self.user["id"]

        # Get total count for pagination
        try:
            all_posts = db.get_recent_posts(user_id, limit=200)
        except Exception as e:
            logger.error(f"Failed to fetch posts for pagination: {e}")
            all_posts = []

        total = len(all_posts)
        self.total_pages = max(1, math.ceil(total / POSTS_PER_PAGE))

        if self.page > self.total_pages:
            self.page = self.total_pages

        # Slice for current page
        start = (self.page - 1) * POSTS_PER_PAGE
        end = start + POSTS_PER_PAGE
        page_posts = all_posts[start:end]

        self._update_button_states()

        return posts_embed(page_posts, self.page, self.total_pages)

    @ui.button(
        label="前へ",
        emoji="\u25c0\ufe0f",
        style=discord.ButtonStyle.secondary,
        custom_id="posts:prev",
        row=1,
        disabled=True,
    )
    async def prev_button(self, interaction: discord.Interaction, button: ui.Button):
        if not self.user:
            self.user = db.get_user_by_discord_id(str(interaction.user.id))

        self.page = max(1, self.page - 1)
        embed = await self.build_embed()
        await interaction.response.edit_message(embed=embed, view=self)

    @ui.button(
        label="次へ",
        emoji="\u25b6\ufe0f",
        style=discord.ButtonStyle.secondary,
        custom_id="posts:next",
        row=1,
    )
    async def next_button(self, interaction: discord.Interaction, button: ui.Button):
        if not self.user:
            self.user = db.get_user_by_discord_id(str(interaction.user.id))

        self.page = min(self.total_pages, self.page + 1)
        embed = await self.build_embed()
        await interaction.response.edit_message(embed=embed, view=self)

    @ui.button(
        label="失敗を再試行",
        emoji="\U0001f504",
        style=discord.ButtonStyle.danger,
        custom_id="posts:retry",
        row=2,
    )
    async def retry_button(self, interaction: discord.Interaction, button: ui.Button):
        user = self.user
        if not user:
            user = db.get_user_by_discord_id(str(interaction.user.id))
        if not user:
            await interaction.response.send_message(
                "ユーザー情報が見つかりません。", ephemeral=True
            )
            return

        await interaction.response.defer(ephemeral=True, thinking=True)

        # Find failed posts and re-queue them
        failed_posts = _get_failed_posts(user["id"])
        if not failed_posts:
            await interaction.followup.send(
                embed=discord.Embed(
                    title="再試行対象なし",
                    description="失敗した投稿はありません。",
                    color=0xF1C40F,
                ),
                ephemeral=True,
            )
            return

        requeued = 0
        for post in failed_posts:
            try:
                db.update_post_status(post["id"], "queued", error_message=None)
                requeued += 1
            except Exception as e:
                logger.error(f"Failed to requeue post {post.get('id')}: {e}")

        embed = discord.Embed(
            title="\U0001f504 再試行キュー登録",
            description=(
                f"**{requeued}件** の投稿を再キューに登録しました。\n"
                "次のサイクル実行時に再投稿されます。"
            ),
            color=0x2ECC71,
        )
        await interaction.followup.send(embed=embed, ephemeral=True)

    @ui.button(
        label="メニューに戻る",
        emoji="\u2b05\ufe0f",
        style=discord.ButtonStyle.secondary,
        custom_id="posts:back",
        row=3,
    )
    async def back_button(self, interaction: discord.Interaction, button: ui.Button):
        from bot.views.main_menu import MainMenuView
        from bot.embeds import main_menu_embed

        embed = main_menu_embed()
        await interaction.response.edit_message(embed=embed, view=MainMenuView())


def _get_failed_posts(user_id: str) -> list[dict]:
    """Get all failed posts for the user."""
    try:
        resp = (
            db.supabase.table("posts")
            .select("*")
            .eq("user_id", user_id)
            .eq("status", "failed")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return resp.data
    except Exception as e:
        logger.error(f"Failed to fetch failed posts for user {user_id}: {e}")
        return []
