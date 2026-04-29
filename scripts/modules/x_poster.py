"""Post tweets on X (Twitter) using Playwright browser automation."""

from __future__ import annotations

import asyncio
import re

from loguru import logger
from playwright.async_api import Browser, Page, async_playwright

_TIMEOUT_MS = 30_000
_MAX_TWEET_LEN = 280


async def _login(page: Page, username: str, password: str) -> None:
    logger.info("Logging in to X as {}", username)
    await page.goto("https://x.com/i/flow/login", wait_until="networkidle")
    await asyncio.sleep(2)

    username_input = page.locator('input[autocomplete="username"], input[name="text"]').first
    await username_input.fill(username)
    await page.keyboard.press("Enter")
    await asyncio.sleep(2)

    # Handle optional verification step
    verification_input = page.locator(
        'input[data-testid="ocfEnterTextTextInput"], input[name="text"][type="text"]'
    ).first
    try:
        await verification_input.wait_for(state="visible", timeout=3000)
        page_text = await page.inner_text("body")
        if "電話" in page_text or "phone" in page_text.lower():
            if re.match(r"[\d\+\-]+", username):
                await verification_input.fill(username)
            else:
                raise RuntimeError("X login requires phone verification — cannot proceed automatically")
        else:
            await verification_input.fill(username)
        await page.keyboard.press("Enter")
        await asyncio.sleep(2)
    except Exception as e:
        if "timeout" not in str(e).lower() and "waiting" not in str(e).lower():
            raise

    password_input = page.locator('input[name="password"], input[type="password"]').first
    await password_input.fill(password)
    await page.keyboard.press("Enter")

    try:
        await page.wait_for_url("**/home**", timeout=_TIMEOUT_MS)
        logger.info("Logged in to X successfully")
    except Exception:
        current_url = page.url
        if "x.com" in current_url and "login" not in current_url:
            logger.info("Logged in to X (landed on {})", current_url)
        else:
            raise RuntimeError("X login failed: could not authenticate")


async def _extract_tweet_id(page: Page, username: str) -> str:
    """Get the tweet_id of the most recently posted tweet from the user's profile."""
    await page.goto(f"https://x.com/{username}", wait_until="networkidle")
    await asyncio.sleep(2)

    tweet_link = page.locator(f'a[href*="/{username}/status/"]').first
    try:
        href = await tweet_link.get_attribute("href", timeout=10_000)
        if href:
            m = re.search(r"/status/(\d+)", href)
            if m:
                return m.group(1)
    except Exception:
        pass

    m = re.search(r"/status/(\d+)", page.url)
    if m:
        return m.group(1)

    logger.warning("Could not extract tweet_id")
    return ""


async def post_tweet(account: dict, text: str) -> str:
    """Post a tweet and return the tweet_id.

    Parameters
    ----------
    account : dict
        Must contain ``x_username`` and ``x_password`` (decrypted).
    text : str
        Tweet text (max 280 characters).
    """
    if len(text) > _MAX_TWEET_LEN:
        text = text[:_MAX_TWEET_LEN - 1] + "…"

    username = account["x_username"]
    password = account["x_password"]
    browser: Browser | None = None

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True, args=["--no-sandbox"])
            context = await browser.new_context(viewport={"width": 1280, "height": 800}, locale="ja-JP")
            page = await context.new_page()
            page.set_default_timeout(_TIMEOUT_MS)

            await _login(page, username, password)

            await page.goto("https://x.com/compose/post", wait_until="networkidle")
            await asyncio.sleep(1)

            tweet_box = page.locator(
                '[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"]'
            ).first
            await tweet_box.click()
            await page.keyboard.type(text, delay=20)
            await asyncio.sleep(0.5)

            post_btn = page.locator(
                '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'
            ).first
            await post_btn.click()
            await asyncio.sleep(3)

            tweet_id = await _extract_tweet_id(page, username)
            logger.info("Tweet posted: {}", tweet_id)

            await context.close()
            await browser.close()
            browser = None
            return tweet_id

    except Exception as e:
        logger.error("post_tweet failed: {}", e)
        raise
    finally:
        if browser:
            try:
                await browser.close()
            except Exception:
                pass
