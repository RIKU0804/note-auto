"""Check for new replies on X posts using Playwright browser automation.

Scrapes the notifications/mentions tab and returns unread replies.
"""

from __future__ import annotations

import asyncio
import re

from loguru import logger
from playwright.async_api import Browser, async_playwright

from modules.x_poster import login

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

REPLY_CHECK_BASE_MINUTES = 30
REPLY_CHECK_RANGE_MINUTES = 5


# ---------------------------------------------------------------------------
# Reply scraping helpers
# ---------------------------------------------------------------------------

async def _scrape_mentions(page) -> list[dict]:
    """Scrape replies from the X notifications/mentions tab.

    Returns a list of dicts with keys:
        original_tweet_id, reply_tweet_id, reply_text, author
    """
    replies: list[dict] = []

    logger.info("Navigating to X notifications/mentions")
    await page.goto(
        "https://x.com/notifications/mentions",
        wait_until="networkidle",
    )
    await asyncio.sleep(3)

    # Scroll to load more mentions
    for _ in range(3):
        await page.keyboard.press("End")
        await asyncio.sleep(1)

    # Collect all tweet/reply articles on the page
    articles = page.locator('article[data-testid="tweet"]')
    count = await articles.count()
    logger.debug(f"Found {count} mention articles on page")

    for i in range(count):
        try:
            article = articles.nth(i)

            # Extract author handle
            author_el = article.locator(
                '[data-testid="User-Name"] a[href*="/"]'
            ).first
            author_href = await author_el.get_attribute("href", timeout=3000)
            author = author_href.strip("/").split("/")[-1] if author_href else ""

            # Extract reply text
            text_el = article.locator(
                '[data-testid="tweetText"]'
            ).first
            reply_text = await text_el.inner_text(timeout=3000)

            # Extract reply tweet_id from the timestamp link
            time_link = article.locator('a[href*="/status/"] time').locator("..")
            link_href = await time_link.get_attribute("href", timeout=3000)
            reply_tweet_id = ""
            original_tweet_id = ""
            if link_href:
                match = re.search(r"/status/(\d+)", link_href)
                if match:
                    reply_tweet_id = match.group(1)

            # Try to find the original (parent) tweet_id from "replying to" context
            replying_to = article.locator('a[href*="/status/"]')
            replying_links = await replying_to.all()
            for link in replying_links:
                href = await link.get_attribute("href")
                if href and "/status/" in href:
                    match = re.search(r"/status/(\d+)", href)
                    if match and match.group(1) != reply_tweet_id:
                        original_tweet_id = match.group(1)
                        break

            if reply_tweet_id and reply_text:
                replies.append({
                    "original_tweet_id": original_tweet_id,
                    "reply_tweet_id": reply_tweet_id,
                    "reply_text": reply_text.strip(),
                    "author": author,
                })

        except Exception as e:
            logger.debug(f"Skipping mention article {i}: {e}")
            continue

    logger.info(f"Scraped {len(replies)} replies from mentions")
    return replies


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def run(account: dict) -> list[dict]:
    """Check for new replies on the account's X posts.

    Parameters
    ----------
    account : dict
        Must contain ``x_username`` and ``x_password`` (decrypted).

    Returns
    -------
    list[dict]
        Each dict has keys: ``original_tweet_id``, ``reply_tweet_id``,
        ``reply_text``, ``author``.
    """
    username = account["x_username"]
    password = account["x_password"]

    browser: Browser | None = None
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True,
                args=["--no-sandbox"],
            )
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                locale="ja-JP",
            )
            page = await context.new_page()
            page.set_default_timeout(30000)

            # Login to X
            await login(page, username, password)

            # Scrape mentions
            replies = await _scrape_mentions(page)

            await context.close()
            await browser.close()
            browser = None

            return replies

    except Exception as e:
        logger.error(f"reply_checker failed: {e}")
        raise
    finally:
        if browser:
            try:
                await browser.close()
            except Exception:
                pass
