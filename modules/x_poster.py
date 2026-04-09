"""Post tweets and replies on X (Twitter) using Playwright browser automation.

Handles login (including verification steps), tweet composition,
promotional tweets for note articles, and reply posting.
"""

from __future__ import annotations

import asyncio
import re

from loguru import logger
from playwright.async_api import Browser, Page, async_playwright

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

X_POST_CONFIG = {
    "timeout_ms": 30000,
    "max_tweet_length": 280,
}


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

async def login(page: Page, username: str, password: str) -> None:
    """Login to X (x.com).

    Fills credentials and handles possible phone/email verification step.
    """
    logger.info("Navigating to X login page")
    await page.goto("https://x.com/i/flow/login", wait_until="networkidle")
    await asyncio.sleep(2)

    # Step 1: Enter username
    logger.debug("Entering username")
    username_input = page.locator('input[autocomplete="username"], input[name="text"]').first
    await username_input.fill(username)
    await page.keyboard.press("Enter")
    await asyncio.sleep(2)

    # Step 2: Check for phone/email verification challenge
    verification_input = page.locator(
        'input[data-testid="ocfEnterTextTextInput"], '
        'input[name="text"][type="text"]'
    ).first
    try:
        await verification_input.wait_for(state="visible", timeout=3000)
        # Verification step detected — check what's being asked
        page_text = await page.inner_text("body")
        if "電話" in page_text or "phone" in page_text.lower():
            logger.warning("Phone verification requested during X login")
            # Try filling with phone from the username field if it looks like a phone
            if re.match(r"[\d\+\-]+", username):
                await verification_input.fill(username)
            else:
                raise RuntimeError("X login requires phone verification — cannot proceed automatically")
        elif "メール" in page_text or "email" in page_text.lower():
            logger.warning("Email verification requested during X login")
            await verification_input.fill(username)
        else:
            logger.warning("Unknown verification challenge during X login")
            await verification_input.fill(username)
        await page.keyboard.press("Enter")
        await asyncio.sleep(2)
    except Exception as e:
        if "timeout" in str(e).lower() or "waiting" in str(e).lower():
            logger.debug("No verification step — proceeding to password")
        else:
            raise

    # Step 3: Enter password
    logger.debug("Entering password")
    password_input = page.locator('input[name="password"], input[type="password"]').first
    await password_input.fill(password)
    await page.keyboard.press("Enter")

    # Wait for home timeline
    try:
        await page.wait_for_url(
            "**/home**",
            timeout=X_POST_CONFIG["timeout_ms"],
        )
        logger.info("Successfully logged in to X")
    except Exception:
        # Check if we landed on some other authenticated page
        current_url = page.url
        if "x.com" in current_url and "login" not in current_url:
            logger.info(f"Logged in to X (landed on {current_url})")
        else:
            logger.error("X login failed — did not reach an authenticated page")
            raise RuntimeError("X login failed: could not authenticate")


# ---------------------------------------------------------------------------
# Tweet posting
# ---------------------------------------------------------------------------

async def post_tweet(account: dict, text: str) -> str:
    """Post a tweet on X.

    Parameters
    ----------
    account : dict
        Must contain ``x_username`` and ``x_password`` (decrypted).
    text : str
        Tweet text (max 280 characters).

    Returns
    -------
    str
        The tweet_id extracted from the URL after posting.
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
            page.set_default_timeout(X_POST_CONFIG["timeout_ms"])

            await login(page, username, password)

            # Navigate to compose (home page should have the compose box)
            logger.info("Composing tweet")
            await page.goto("https://x.com/compose/post", wait_until="networkidle")
            await asyncio.sleep(1)

            # Type tweet text
            tweet_box = page.locator(
                '[data-testid="tweetTextarea_0"], '
                '[role="textbox"][contenteditable="true"]'
            ).first
            await tweet_box.click()
            await page.keyboard.type(text, delay=20)
            await asyncio.sleep(0.5)

            # Click post button
            post_btn = page.locator(
                '[data-testid="tweetButton"], '
                '[data-testid="tweetButtonInline"]'
            ).first
            await post_btn.click()

            # Wait for the tweet to be posted and extract tweet_id
            await asyncio.sleep(3)

            # Try to get the tweet URL from the latest notification or redirect
            tweet_id = await _extract_tweet_id(page, username)
            logger.info(f"Tweet posted successfully: {tweet_id}")

            await context.close()
            await browser.close()
            browser = None

            return tweet_id

    except Exception as e:
        logger.error(f"post_tweet failed: {e}")
        raise
    finally:
        if browser:
            try:
                await browser.close()
            except Exception:
                pass


async def _extract_tweet_id(page: Page, username: str) -> str:
    """Extract the tweet_id of the most recently posted tweet.

    Navigates to the user's profile and grabs the top tweet's ID.
    """
    await page.goto(f"https://x.com/{username}", wait_until="networkidle")
    await asyncio.sleep(2)

    # Find the first tweet link that contains /status/
    tweet_link = page.locator(f'a[href*="/{username}/status/"]').first
    try:
        href = await tweet_link.get_attribute("href", timeout=10000)
        if href:
            match = re.search(r"/status/(\d+)", href)
            if match:
                return match.group(1)
    except Exception:
        pass

    # Fallback: check the current URL
    current_url = page.url
    match = re.search(r"/status/(\d+)", current_url)
    if match:
        return match.group(1)

    logger.warning("Could not extract tweet_id — returning empty string")
    return ""


# ---------------------------------------------------------------------------
# Reply posting
# ---------------------------------------------------------------------------

async def post_reply(account: dict, tweet_id: str, text: str) -> str:
    """Post a reply to a specific tweet.

    Parameters
    ----------
    account : dict
        Must contain ``x_username`` and ``x_password``.
    tweet_id : str
        The ID of the tweet to reply to.
    text : str
        Reply text.

    Returns
    -------
    str
        The reply's tweet_id.
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
            page.set_default_timeout(X_POST_CONFIG["timeout_ms"])

            await login(page, username, password)

            # Navigate to the tweet
            logger.info(f"Navigating to tweet {tweet_id}")
            await page.goto(
                f"https://x.com/i/status/{tweet_id}",
                wait_until="networkidle",
            )
            await asyncio.sleep(1)

            # Click the reply input area
            reply_box = page.locator(
                '[data-testid="tweetTextarea_0"], '
                '[role="textbox"][contenteditable="true"]'
            ).first
            await reply_box.click()
            await page.keyboard.type(text, delay=20)
            await asyncio.sleep(0.5)

            # Click reply button
            reply_btn = page.locator(
                '[data-testid="tweetButton"], '
                '[data-testid="tweetButtonInline"]'
            ).first
            await reply_btn.click()

            await asyncio.sleep(3)

            # Extract reply tweet_id
            reply_tweet_id = await _extract_tweet_id(page, username)
            logger.info(f"Reply posted successfully: {reply_tweet_id}")

            await context.close()
            await browser.close()
            browser = None

            return reply_tweet_id

    except Exception as e:
        logger.error(f"post_reply failed: {e}")
        raise
    finally:
        if browser:
            try:
                await browser.close()
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Promo tweet composition
# ---------------------------------------------------------------------------

def compose_promo_tweet(
    note_url: str,
    title: str,
    genre_config: dict,
) -> str:
    """Compose a promotional tweet for a note article.

    Uses the genre's ``promo_tweet_template`` and ensures the result
    is under 280 characters.

    Parameters
    ----------
    note_url : str
        Published note article URL.
    title : str
        Article title.
    genre_config : dict
        Genre configuration containing ``promo_tweet_template``.

    Returns
    -------
    str
        Formatted tweet text.
    """
    template = genre_config.get(
        "promo_tweet_template",
        "{title}\n{url}",
    )

    tweet = template.format(title=title, url=note_url)

    # Truncate if over 280 characters (preserve URL)
    max_len = X_POST_CONFIG["max_tweet_length"]
    if len(tweet) > max_len:
        # URLs on X are always counted as 23 characters (t.co wrapping)
        url_display_len = 23
        available = max_len - url_display_len - 2  # 2 for newline + buffer
        # Rebuild with truncated text portion
        text_part = template.split("{url}")[0].format(title=title)
        if len(text_part) > available:
            text_part = text_part[: available - 1] + "…"
        tweet = f"{text_part}{note_url}"

    logger.debug(f"Composed promo tweet ({len(tweet)} chars): {tweet[:80]}...")
    return tweet


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def run(
    account: dict,
    post: dict,
    note_url: str,
    genre_config: dict,
) -> str:
    """Compose and post a promotional tweet for a note article.

    Parameters
    ----------
    account : dict
        X account credentials.
    post : dict
        Post data containing ``title``.
    note_url : str
        URL of the published note article.
    genre_config : dict
        Genre configuration for tweet template.

    Returns
    -------
    str
        The tweet_id of the posted promotional tweet.
    """
    title = post.get("title", "")
    tweet_text = compose_promo_tweet(note_url, title, genre_config)
    tweet_id = await post_tweet(account, tweet_text)
    return tweet_id
