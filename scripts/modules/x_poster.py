"""Post tweets on X (Twitter), optionally attaching a generated image.

Two backends are available, selected via the ``X_CLIENT`` environment variable:

- ``X_CLIENT=api`` (default) — official X API V2 via tweepy.
  Requires an OAuth 2.0 Bearer Token and the OAuth 1.0a user-context
  4-tuple (consumer key/secret + access token/secret). The 4-tuple is
  required when ``media_bytes`` is supplied because tweepy uses the
  v1.1 ``media/upload`` endpoint, which is OAuth 1.0a only.

- ``X_CLIENT=playwright`` — legacy headless-browser login flow.
  KEPT FOR FALLBACK ONLY. Violates X's ToS and risks account
  suspension. Do not enable in production.

Public API:
    post_tweet(account: dict, text: str, *, media_bytes: bytes | None = None)
        -> dict[str, Any]
        Returns {"tweet_id": str, "posted_at": str (ISO 8601, UTC)}.
"""

from __future__ import annotations

import asyncio
import io
import os
import re
from datetime import datetime, timezone
from typing import Any

import tweepy
from loguru import logger

# Japanese tweets are weighted 2x in X's character counter, so the
# practical ceiling for ja-only text is 140. Match the generator.
_MAX_TWEET_LEN = 140
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

def _build_tweepy_v2_client(account: dict) -> tweepy.Client:
    """Build a tweepy V2 Client from credentials stored on the account row."""
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


def _build_tweepy_v1_api(account: dict) -> tweepy.API:
    """Build a tweepy v1.1 API client for media uploads.

    Requires the full OAuth 1.0a 4-tuple; raises a clear error if any are
    missing because v1.1 ``media/upload`` cannot be authenticated with
    Bearer tokens alone.
    """
    api_key = account.get("x_api_key")
    api_secret = account.get("x_api_secret")
    access_token = account.get("x_access_token")
    access_token_secret = account.get("x_access_token_secret")

    missing = [
        n
        for n, v in (
            ("x_api_key", api_key),
            ("x_api_secret", api_secret),
            ("x_access_token", access_token),
            ("x_access_token_secret", access_token_secret),
        )
        if not v
    ]
    if missing:
        raise RuntimeError(
            "OAuth 1.0a credentials required for media upload, missing: "
            + ", ".join(missing)
        )

    auth = tweepy.OAuth1UserHandler(
        api_key, api_secret, access_token, access_token_secret,
    )
    return tweepy.API(auth)


def _upload_media(account: dict, media_bytes: bytes) -> str:
    """Upload PNG bytes via v1.1 and return the media_id_string."""
    api_v1 = _build_tweepy_v1_api(account)
    buf = io.BytesIO(media_bytes)
    media = api_v1.media_upload(filename="image.png", file=buf)
    media_id = getattr(media, "media_id_string", None) or str(
        getattr(media, "media_id", "")
    )
    if not media_id:
        raise RuntimeError(f"media_upload returned no id: {media!r}")
    logger.info("Uploaded media to X: {}", media_id)
    return media_id


def _post_via_api(account: dict, text: str, media_bytes: bytes | None) -> dict[str, Any]:
    """Synchronous tweepy call. Wrapped by ``post_tweet`` for async use."""
    media_ids: list[str] | None = None
    if media_bytes:
        media_ids = [_upload_media(account, media_bytes)]

    client = _build_tweepy_v2_client(account)
    kwargs: dict[str, Any] = {"text": text}
    if media_ids:
        kwargs["media_ids"] = media_ids

    try:
        response = client.create_tweet(**kwargs)
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

async def post_tweet(
    account: dict,
    text: str,
    *,
    media_bytes: bytes | None = None,
) -> dict[str, Any]:
    """Post a tweet for the given account, optionally with one attached image.

    Parameters
    ----------
    account : dict
        Row from the ``accounts`` table, with credentials already decrypted.
    text : str
        Tweet body. Truncated to 140 characters.
    media_bytes : bytes | None
        PNG bytes to upload via v1.1 ``media/upload`` and attach to the
        tweet. ``None`` posts text-only.

    Returns
    -------
    dict
        ``{"tweet_id": str, "posted_at": str}`` — UTC ISO-8601.
    """
    text = _truncate(text)
    mode = _client_mode()

    if mode == "playwright":
        if media_bytes:
            logger.warning(
                "Playwright fallback ignores media_bytes — posting text only."
            )
        return await _post_via_playwright(account, text)

    # Default: official X API V2 — run blocking tweepy off the event loop.
    return await asyncio.to_thread(_post_via_api, account, text, media_bytes)
