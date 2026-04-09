"""
Discord Bot entry point for X x note automation SaaS.

Uses discord.py 2.3.2 with Button-based Views for all interactions.
Users are identified by Discord User ID -> Supabase users table lookup.
"""

import discord
from discord.ext import commands
import os

from dotenv import load_dotenv
from loguru import logger

load_dotenv()

intents = discord.Intents.default()
bot = commands.Bot(command_prefix="!", intents=intents)


# ---------------------------------------------------------------------------
# View imports (registered on ready)
# ---------------------------------------------------------------------------
from bot.views.main_menu import MainMenuView
from bot.views.status_view import StatusView
from bot.views.control_view import ControlView
from bot.views.run_view import RunView
from bot.views.posts_view import PostsView
from bot.views.error_view import ErrorView


# ---------------------------------------------------------------------------
# Persistent views registry
# ---------------------------------------------------------------------------
PERSISTENT_VIEWS = [
    MainMenuView,
    StatusView,
    ControlView,
    RunView,
    PostsView,
    ErrorView,
]


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------
@bot.event
async def on_ready():
    """Register persistent views and log readiness."""
    for view_cls in PERSISTENT_VIEWS:
        bot.add_view(view_cls())

    logger.info(f"Bot ready as {bot.user} (ID: {bot.user.id})")
    logger.info(f"Guilds: {len(bot.guilds)}")

    # Send main menu to configured control channels
    control_channel_ids = os.getenv("DISCORD_CONTROL_CHANNEL_IDS", "")
    if control_channel_ids:
        from bot.embeds import main_menu_embed

        for channel_id_str in control_channel_ids.split(","):
            channel_id_str = channel_id_str.strip()
            if not channel_id_str:
                continue
            try:
                channel = bot.get_channel(int(channel_id_str))
                if channel is None:
                    channel = await bot.fetch_channel(int(channel_id_str))
                embed = main_menu_embed()
                await channel.send(embed=embed, view=MainMenuView())
                logger.info(f"Sent main menu to channel {channel_id_str}")
            except Exception as e:
                logger.error(f"Failed to send menu to channel {channel_id_str}: {e}")


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
@bot.command(name="menu")
async def menu_command(ctx: commands.Context):
    """Send the main menu to the current channel."""
    from bot.embeds import main_menu_embed

    embed = main_menu_embed()
    await ctx.send(embed=embed, view=MainMenuView())
    logger.info(f"Menu sent by {ctx.author} in #{ctx.channel}")


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    token = os.getenv("DISCORD_BOT_TOKEN")
    if not token:
        logger.error("DISCORD_BOT_TOKEN is not set")
        raise SystemExit(1)

    logger.info("Starting Discord bot...")
    bot.run(token)
