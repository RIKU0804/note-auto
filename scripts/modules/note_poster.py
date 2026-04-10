"""Post paid articles to note.com using Playwright browser automation.

Handles login, article creation with paywall separator, pricing, and publishing.
"""

from __future__ import annotations

import asyncio

from loguru import logger
from playwright.async_api import Browser, Page, async_playwright

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

NOTE_POST_CONFIG = {
    "default_price": 300,
    "timeout_ms": 30000,
}


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

async def login(page: Page, email: str, password: str) -> None:
    """Login to note.com.

    Navigate to the login page, fill credentials, submit, and wait for
    redirect to the dashboard.  Logs a warning if captcha / verification
    is detected.
    """
    logger.info("Navigating to note.com login page")
    await page.goto("https://note.com/login", wait_until="networkidle")

    # Fill credentials
    await page.fill('input[name="login"]', email)
    await page.fill('input[name="password"]', password)

    # Click login button
    await page.click('button[type="submit"]')

    # Wait for navigation to dashboard (or timeout)
    try:
        await page.wait_for_url(
            "**/dashboard**",
            timeout=NOTE_POST_CONFIG["timeout_ms"],
        )
        logger.info("Successfully logged in to note.com")
    except Exception:
        # Check for captcha / verification elements
        captcha = await page.query_selector('[class*="captcha"], [class*="recaptcha"], [id*="captcha"]')
        verification = await page.query_selector('[class*="verification"], [class*="confirm"]')

        if captcha:
            logger.warning("CAPTCHA detected on note.com login — manual intervention may be required")
            raise RuntimeError("note.com login blocked by CAPTCHA")
        if verification:
            logger.warning("Email/phone verification detected on note.com login")
            raise RuntimeError("note.com login requires additional verification")

        logger.error("note.com login failed — unexpected state")
        raise RuntimeError("note.com login failed: did not reach dashboard")


# ---------------------------------------------------------------------------
# Article publishing
# ---------------------------------------------------------------------------

async def _fill_article(page: Page, post: dict) -> None:
    """Fill in the article editor with title, free preview, paywall, and paid content.

    Uses the pre-split ``content_free`` / ``content_paid`` fields produced
    by ``generator.run``.
    """
    title = post.get("title", "")
    free_part = post.get("content_free", "") or ""
    paid_part = post.get("content_paid", "") or ""

    # Fill title
    logger.debug(f"Setting article title: {title[:50]}...")
    title_input = page.locator('[class*="title"] textarea, [placeholder*="タイトル"], [data-testid="title-input"]').first
    await title_input.fill(title)
    await asyncio.sleep(0.5)

    # Fill free preview content
    logger.debug("Filling free preview content")
    editor = page.locator('[class*="editor"], [contenteditable="true"], [role="textbox"]').first
    await editor.click()
    await page.keyboard.type(free_part, delay=10)

    # Insert paywall separator (note.com uses a specific button/action)
    logger.debug("Inserting paywall separator")
    # Try the paywall button in the toolbar
    paywall_btn = page.locator(
        'button:has-text("有料ライン"), '
        'button:has-text("有料"), '
        '[data-testid="paywall-button"], '
        'button[aria-label*="有料"]'
    ).first
    try:
        await paywall_btn.click(timeout=5000)
        logger.debug("Paywall separator inserted via button")
    except Exception:
        # Fallback: try keyboard shortcut or menu
        logger.warning("Paywall button not found, attempting menu insertion")
        menu_btn = page.locator('button:has-text("＋"), button[aria-label="挿入"]').first
        try:
            await menu_btn.click(timeout=3000)
            await asyncio.sleep(0.3)
            paywall_option = page.locator('text=有料ライン, text=有料エリア').first
            await paywall_option.click(timeout=3000)
        except Exception:
            logger.error("Failed to insert paywall separator — article may not have paid section")

    await asyncio.sleep(0.3)

    # Fill paid content after the paywall
    logger.debug("Filling paid content section")
    await page.keyboard.type(paid_part, delay=10)


async def _set_price(page: Page, price: int) -> None:
    """Set the article price."""
    logger.debug(f"Setting article price to {price} yen")
    price_input = page.locator(
        'input[name="price"], '
        'input[placeholder*="価格"], '
        'input[type="number"], '
        '[data-testid="price-input"]'
    ).first
    await price_input.fill(str(price))
    await asyncio.sleep(0.3)


async def _publish(page: Page) -> str:
    """Click publish and return the published article URL."""
    logger.info("Publishing article")

    # Click the publish / submit button
    publish_btn = page.locator(
        'button:has-text("公開"), '
        'button:has-text("投稿"), '
        '[data-testid="publish-button"]'
    ).first
    await publish_btn.click()

    # Confirm dialog if present
    try:
        confirm_btn = page.locator(
            'button:has-text("公開する"), '
            'button:has-text("確認"), '
            '[data-testid="confirm-publish"]'
        ).first
        await confirm_btn.click(timeout=5000)
    except Exception:
        pass  # No confirmation dialog

    # Wait for navigation to the published article
    await page.wait_for_url(
        "**/n/**",
        timeout=NOTE_POST_CONFIG["timeout_ms"],
    )
    article_url = page.url
    logger.info(f"Article published: {article_url}")
    return article_url


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def run(account: dict, post: dict) -> str:
    """Publish a paid article to note.com.

    Parameters
    ----------
    account : dict
        Must contain ``note_email`` and ``note_password`` (decrypted).
    post : dict
        Must contain ``title``, ``content_free``, ``content_paid``.
        Optional: ``note_price`` (default 300 yen).

    Returns
    -------
    str
        The URL of the published article.
    """
    email = account["note_email"]
    password = account["note_password"]
    price = post.get("note_price", NOTE_POST_CONFIG["default_price"])

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
            page.set_default_timeout(NOTE_POST_CONFIG["timeout_ms"])

            # Login
            await login(page, email, password)

            # Navigate to article editor
            logger.info("Navigating to article editor")
            await page.goto(
                "https://note.com/notes/new",
                wait_until="networkidle",
            )

            # Fill article content
            await _fill_article(page, post)

            # Set price
            await _set_price(page, price)

            # Publish
            article_url = await _publish(page)

            await context.close()
            await browser.close()
            browser = None

            return article_url

    except Exception as e:
        logger.error(f"note_poster failed: {e}")
        raise
    finally:
        if browser:
            try:
                await browser.close()
            except Exception:
                pass
