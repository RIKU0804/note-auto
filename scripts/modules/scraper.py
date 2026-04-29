"""Scrape trending tweets from X and analyze them with AI for X post generation.

Uses Playwright (headless Chromium) for X scraping and OpenRouter for
AI-powered trend analysis.
"""

from __future__ import annotations

import json
import os
import urllib.parse
from datetime import datetime, timezone

import httpx
from loguru import logger
from playwright.async_api import async_playwright, TimeoutError as PWTimeout

from modules import db

SCRAPE_CONFIG = {
    "x_target_count": 30,
    "x_min_likes": 100,
}

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ---------------------------------------------------------------------------
# X (Twitter) scraping
# ---------------------------------------------------------------------------

async def _login_to_x(page, account: dict) -> None:
    logger.info("Logging in to X as {}", account.get("x_username", "unknown"))

    await page.goto("https://x.com/i/flow/login", wait_until="domcontentloaded", timeout=30_000)
    await page.wait_for_timeout(3000)

    email_input = page.locator('input[autocomplete="username"]')
    await email_input.wait_for(state="visible", timeout=15_000)
    await email_input.fill(account["x_username"])
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(2000)

    verification_input = page.locator('input[data-testid="ocfEnterTextTextInput"]')
    try:
        await verification_input.wait_for(state="visible", timeout=5000)
        verify_value = account.get("x_phone", account.get("x_username", ""))
        logger.info("Verification prompt detected, entering: {}", verify_value)
        await verification_input.fill(verify_value)
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(2000)
    except PWTimeout:
        logger.debug("No verification prompt — proceeding to password")

    password_input = page.locator('input[type="password"]')
    await password_input.wait_for(state="visible", timeout=15_000)
    await password_input.fill(account["x_password"])
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(3000)

    try:
        await page.wait_for_url("**/home**", timeout=15_000)
        logger.info("Successfully logged in to X")
    except PWTimeout:
        current_url = page.url
        if "login" in current_url or "flow" in current_url:
            raise RuntimeError(f"X login failed, stuck at: {current_url}")
        logger.info("Login appears successful (current URL: {})", current_url)


async def _extract_tweets_from_page(page, min_likes: int) -> list[dict]:
    tweets: list[dict] = []
    tweet_articles = page.locator('article[data-testid="tweet"]')
    count = await tweet_articles.count()

    for i in range(count):
        try:
            article = tweet_articles.nth(i)

            text_el = article.locator('div[data-testid="tweetText"]')
            text = await text_el.inner_text(timeout=3000) if await text_el.count() > 0 else ""

            author_el = article.locator('div[data-testid="User-Name"] a').first
            author_href = await author_el.get_attribute("href", timeout=3000) if await author_el.count() > 0 else ""
            author = author_href.strip("/").split("/")[-1] if author_href else "unknown"

            likes = 0
            retweets = 0

            like_el = article.locator('button[data-testid="like"] span, button[data-testid="unlike"] span')
            if await like_el.count() > 0:
                likes = _parse_metric(await like_el.first.inner_text(timeout=2000))

            rt_el = article.locator('button[data-testid="retweet"] span, button[data-testid="unretweet"] span')
            if await rt_el.count() > 0:
                retweets = _parse_metric(await rt_el.first.inner_text(timeout=2000))

            if likes < min_likes:
                continue

            parent_link = article.locator('a[href*="/status/"]').first
            href = await parent_link.get_attribute("href", timeout=2000) or ""
            tweet_id = next((p for p in href.split("/") if p.isdigit() and len(p) > 10), "")
            if not tweet_id:
                continue

            tweets.append({"tweet_id": tweet_id, "text": text, "likes": likes, "retweets": retweets, "author": author})
        except Exception as e:
            logger.debug("Failed to extract tweet {}: {}", i, e)

    return tweets


def _parse_metric(text: str) -> int:
    text = text.strip().replace(",", "")
    if not text:
        return 0
    try:
        if text.upper().endswith("K"):
            return int(float(text[:-1]) * 1_000)
        elif text.upper().endswith("M"):
            return int(float(text[:-1]) * 1_000_000)
        elif text.upper().endswith("万"):
            return int(float(text[:-1]) * 10_000)
        return int(text)
    except ValueError:
        return 0


async def collect_x_posts(account: dict, genre_config: dict) -> list[dict]:
    """Scrape trending tweets from X search for the given genre."""
    keywords = genre_config.get("search_keywords", [])
    if not keywords:
        logger.warning("No search keywords configured — skipping X scrape")
        return []

    target_count = SCRAPE_CONFIG["x_target_count"]
    min_likes = SCRAPE_CONFIG["x_min_likes"]
    all_tweets: dict[str, dict] = {}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            locale="ja-JP",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        )
        page = await context.new_page()

        try:
            await _login_to_x(page, account)

            for keyword in keywords:
                if len(all_tweets) >= target_count:
                    break

                query = urllib.parse.quote(keyword)
                await page.goto(f"https://x.com/search?q={query}&f=top", wait_until="domcontentloaded", timeout=30_000)
                await page.wait_for_timeout(3000)

                for scroll_idx in range(5):
                    if len(all_tweets) >= target_count:
                        break
                    for t in await _extract_tweets_from_page(page, min_likes):
                        if t["tweet_id"] not in all_tweets:
                            all_tweets[t["tweet_id"]] = t
                    logger.debug("Scroll {}/5: {} tweets so far", scroll_idx + 1, len(all_tweets))
                    await page.evaluate("window.scrollBy(0, window.innerHeight * 2)")
                    await page.wait_for_timeout(2000)

        except Exception as e:
            logger.error("Error during X scraping: {}", e)
        finally:
            await browser.close()

    result = list(all_tweets.values())[:target_count]
    logger.info("Collected {} tweets from X", len(result))
    return result


# ---------------------------------------------------------------------------
# AI trend analysis
# ---------------------------------------------------------------------------

async def analyze_trends(x_posts: list[dict], genre_config: dict) -> dict:
    """Use OpenRouter AI to analyze collected X posts and extract trends."""
    model = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-3-haiku")
    api_key = os.environ.get("OPENROUTER_API_KEY", "")

    if not api_key:
        logger.error("OPENROUTER_API_KEY not set — cannot analyze trends")
        return {"top_topics": [], "trend_summary": "", "keywords": []}

    genre_name = genre_config.get("name", "general")
    genre_keywords = genre_config.get("search_keywords", [])

    tweets_summary = ""
    for i, post in enumerate(x_posts[:20], 1):
        tweets_summary += (
            f"{i}. @{post['author']} (likes: {post['likes']}, RT: {post['retweets']})\n"
            f"   {post['text'][:200]}\n\n"
        )

    prompt = f"""あなたはSNSトレンド分析の専門家です。以下のXのバズ投稿を分析して、投稿テーマを提案してください。

## ジャンル: {genre_name}
## 関連キーワード: {', '.join(genre_keywords)}

## バズっている投稿:
{tweets_summary or "(データなし)"}

以下のJSON形式で回答してください:
{{
  "top_topics": ["トピック1", "トピック2", "トピック3"],
  "trend_summary": "現在のトレンドの要約（2-3文）",
  "keywords": ["キーワード1", "キーワード2", "キーワード3", "キーワード4", "キーワード5"]
}}

JSONのみを返してください。"""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                _OPENROUTER_URL,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": model, "messages": [{"role": "user", "content": prompt}], "max_tokens": 800},
            )
            resp.raise_for_status()
            data = resp.json()

        content = data["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        result = json.loads(content)
        logger.info("Trend analysis complete: {} topics", len(result.get("top_topics", [])))
        return result

    except Exception as e:
        logger.error("Failed to analyze trends: {}", e)
        return {"top_topics": [], "trend_summary": "", "keywords": []}


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

async def run(account: dict, genre_config: dict) -> dict:
    """Collect X trends and analyze them with AI.

    Returns dict with keys: x_posts, analysis
    """
    genre_name = genre_config.get("name", "unknown")
    logger.info("Starting scraper for genre '{}', account '{}'",
                genre_name, account.get("name", account.get("id", "unknown")))

    x_posts = await collect_x_posts(account, genre_config)
    logger.info("Collected {} X posts", len(x_posts))

    analysis = await analyze_trends(x_posts, genre_config)

    try:
        cycle = datetime.now(timezone.utc).strftime("%Y%m%d_%H")
        db.save_research(
            user_id=account["user_id"],
            account_id=account["id"],
            cycle=cycle,
            tweets=[
                {
                    "tweet_id": p["tweet_id"],
                    "tweet_text": p["text"],
                    "likes": p["likes"],
                    "retweets": p["retweets"],
                }
                for p in x_posts
            ],
        )
    except Exception as e:
        logger.error("Failed to save research: {}", e)

    return {"x_posts": x_posts, "analysis": analysis}
