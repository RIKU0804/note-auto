"""Post tweets on X (Twitter).

Two backends are available, selected via the ``X_CLIENT`` environment variable:

- ``X_CLIENT=api`` (default) — official X API V2 via tweepy.
  Requires an OAuth 2.0 Bearer Token (and OAuth 1.0a user-context
  credentials for posting). This is the only ToS-compliant path.

- ``X_CLIENT=playwright`` — legacy headless-browser login flow.
  KEPT FOR FALLBACK ONLY. Violates X's ToS and risks account
  suspension. Do not enable in production.

Public API:
    post_tweet(account: dict, text: str) -> dict[str, Any]
        Returns {"tweet_id": str, "posted_at": str (ISO 8601, UTC)}.
"""

from __future__ import annotations

import asyncio
import os
import re
from datetime import datetime, timezone
from typing import Any

import tweepy
from loguru import logger

_MAX_TWEET_LEN = 280
_DEFAULT_CLIENT = "api"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _truncate(text: str) -> str:
    if len(text) <= _MAX_TWEET_LEN:
        return text
    return text[: _MAX_TWEET_LEN - 1] + "…"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _client_mode() -> str:
    raw = (os.environ.get("X_CLIENT") or _DEFAULT_CLIENT).strip().lower()
    if raw not in {"api", "playwright"}:
        logger.warning("Unknown X_CLIENT='{}', falling back to 'api'", raw)
        return "api"
    return raw


# ---------------------------------------------------------------------------
# Official X API V2 backend (tweepy)
# ---------------------------------------------------------------------------

def _build_tweepy_client(account: dict) -> tweepy.Client:
    """Build a tweepy V2 Client from credentials stored on the account row.

    Strategy:
    - If full OAuth 1.0a user-context creds are present (api_key, api_secret,
      access_token, access_token_secret), use them — this is the most reliable
      path for posting tweets on Free tier.
    - Otherwise fall back to the OAuth 2.0 Bearer Token alone. Note: posting
      tweets with a bare app-only Bearer Token typically returns 403; we still
      construct the client so the user gets a clear error from X itself.
    """
    bearer = account.get("x_bearer_token") or None
    api_key = account.get("x_api_key") or None
    api_secret = account.get("x_api_secret") or None
    access_token = account.get("x_access_token") or None
    access_token_secret = account.get("x_access_token_secret") or None

    if not any([bearer, api_key, access_token]):
        raise RuntimeError(
            "Account is missing X API credentials. "
            "Set x_bearer_token (and ideally x_api_key/x_api_secret/"
            "x_access_token/x_access_token_secret) on the account row."
        )

    return tweepy.Client(
        bearer_token=bearer,
        consumer_key=api_key,
        consumer_secret=api_secret,
        access_token=access_token,
        access_token_secret=access_token_secret,
        wait_on_rate_limit=False,
    )


def _post_via_api(account: dict, text: str) -> dict[str, Any]:
    """Synchronous tweepy call. Wrapped by ``post_tweet`` for async use."""
    client = _build_tweepy_client(account)
    try:
        response = client.create_tweet(text=text)
    except tweepy.TooManyRequests as e:
        logger.error("X API rate limit exceeded for @{}: {}",
                     account.get("x_username", "?"), e)
        raise
    except tweepy.Forbidden as e:
        logger.error("X API rejected the request for @{} (403): {}",
                     account.get("x_username", "?"), e)
        raise
    except tweepy.Unauthorized as e:
        logger.error("X API unauthorized for @{} (401): {}",
                     account.get("x_username", "?"), e)
        raise
    except tweepy.TweepyException as e:
        logger.error("X API call failed for @{}: {}",
                     account.get("x_username", "?"), e)
        raise

    data = getattr(response, "data", None) or {}
    tweet_id = str(data.get("id") or "")
    if not tweet_id:
        raise RuntimeError(f"X API returned an empty tweet id: {response!r}")

    logger.info("Tweet posted via X API V2: {}", tweet_id)
    return {"tweet_id": tweet_id, "posted_at": _now_iso()}


# ---------------------------------------------------------------------------
# Legacy Playwright fallback (DISABLED by default — ToS violation risk)
# ---------------------------------------------------------------------------
# The original headless-browser implementation lives below for emergency
# fallback only. It is gated behind ``X_CLIENT=playwright`` and should not
# be enabled in production.

async def _post_via_playwright(account: dict, text: str) -> dict[str, Any]:
    """LEGACY. Kept for fallback. Imports playwright lazily so the API
    path does not require Chromium to be installed."""
    logger.warning(
        "X_CLIENT=playwright — using legacy browser-login path. "
        "This violates X's Terms of Service and risks account suspension."
    )

    try:
        from playwright.async_api import async_playwright  # type: ignore
    except Exception as e:  # pragma: no cover - import-time failure
        raise RuntimeError(
            "Playwright is not installed. Switch X_CLIENT to 'api' or "
            "install playwright + a browser."
        ) from e

    username = account["x_username"]
    password = account.get("x_password") or account.get("x_password_enc")
    if not password:
        raise RuntimeError("Playwright fallback requires an x_password on the account")

    timeout_ms = 30_000

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=["--no-sandbox"])
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800}, locale="ja-JP"
        )
        page = await context.new_page()
        page.set_default_timeout(timeout_ms)

        try:
            await page.goto("https://x.com/i/flow/login", wait_until="networkidle")
            await asyncio.sleep(2)

            await page.locator(
                'input[autocomplete="username"], input[name="text"]'
            ).first.fill(username)
            await page.keyboard.press("Enter")
            await asyncio.sleep(2)

            await page.locator(
                'input[name="password"], input[type="password"]'
            ).first.fill(password)
            await page.keyboard.press("Enter")
            await page.wait_for_url("**/home**", timeout=timeout_ms)

            await page.goto("https://x.com/compose/post", wait_until="networkidle")
            await asyncio.sleep(1)

            tweet_box = page.locator(
                '[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"]'
            ).first
            await tweet_box.click()
            await page.keyboard.type(text, delay=20)
            await asyncio.sleep(0.5)

            await page.locator(
                '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'
            ).first.click()
            await asyncio.sleep(3)

            # Best-effort tweet_id extraction
            await page.goto(f"https://x.com/{username}", wait_until="networkidle")
            tweet_link = page.locator(f'a[href*="/{username}/status/"]').first
            href = await tweet_link.get_attribute("href", timeout=10_000) or ""
            m = re.search(r"/status/(\d+)", href)
            tweet_id = m.group(1) if m else ""
            return {"tweet_id": tweet_id, "posted_at": _now_iso()}

        finally:
            await context.close()
            await browser.close()


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------

async def post_tweet(account: dict, text: str) -> dict[str, Any]:
    """Post a tweet for the given account.

    Parameters
    ----------
    account : dict
        Row from the ``accounts`` table. Must include ``x_username`` and,
        for the API path, ``x_bearer_token`` (and optionally
        ``x_api_key``/``x_api_secret``/``x_access_token``/
        ``x_access_token_secret`` for OAuth 1.0a user-context posting).
    text : str
        Tweet body. Truncated to 280 characters.

    Returns
    -------
    dict
        ``{"tweet_id": str, "posted_at": str}`` — ``posted_at`` is a
        UTC ISO-8601 timestamp captured at successful response time.
    """
    text = _truncate(text)
    mode = _client_mode()

    if mode == "playwright":
        return await _post_via_playwright(account, text)

    # Default: official X API V2 — runs in a worker thread so we don't block
    # the asyncio loop on tweepy's blocking HTTP call.
    return await asyncio.to_thread(_post_via_api, account, text)
