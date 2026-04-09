"""Scrape trending/viral tweets from X (Twitter) and Google Trends,
then use AI to analyze trends for note article generation.

Uses Playwright (headless Chromium) for X scraping, pytrends for
Google Trends, and OpenRouter API for AI-powered trend analysis.
"""

from __future__ import annotations

import json
import os
import urllib.parse
from datetime import datetime, timezone

import httpx
from loguru import logger
from playwright.async_api import async_playwright, TimeoutError as PWTimeout
from pytrends.request import TrendReq

from modules import db

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRAPE_CONFIG = {
    "x_target_count": 30,
    "x_min_likes": 100,
    "x_hours_range": 24,
    "google_trends_count": 10,
}

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ---------------------------------------------------------------------------
# X (Twitter) scraping
# ---------------------------------------------------------------------------

async def _login_to_x(page, account: dict) -> None:
    """Handle the X login flow: email -> password -> optional verification."""
    logger.info("Logging in to X as {}", account.get("x_username", "unknown"))

    await page.goto("https://x.com/i/flow/login", wait_until="domcontentloaded", timeout=30_000)
    await page.wait_for_timeout(3000)

    # --- Enter email / username ---
    email_input = page.locator('input[autocomplete="username"]')
    await email_input.wait_for(state="visible", timeout=15_000)
    await email_input.fill(account["x_username"])
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(2000)

    # --- Handle possible "unusual login activity" verification ---
    verification_input = page.locator('input[data-testid="ocfEnterTextTextInput"]')
    if await verification_input.is_visible(timeout=3000).catch(lambda _: False) if hasattr(verification_input, "catch") else False:
        pass  # Handled below

    try:
        await verification_input.wait_for(state="visible", timeout=5000)
        # X may ask for phone number or username for verification
        verify_value = account.get("x_phone", account.get("x_username", ""))
        logger.info("Verification prompt detected, entering: {}", verify_value)
        await verification_input.fill(verify_value)
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(2000)
    except PWTimeout:
        logger.debug("No verification prompt — proceeding to password")

    # --- Enter password ---
    password_input = page.locator('input[type="password"]')
    await password_input.wait_for(state="visible", timeout=15_000)
    await password_input.fill(account["x_password"])
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(3000)

    # --- Verify login succeeded ---
    try:
        await page.wait_for_url("**/home**", timeout=15_000)
        logger.info("Successfully logged in to X")
    except PWTimeout:
        # Check if we're on some other authenticated page
        current_url = page.url
        if "login" in current_url or "flow" in current_url:
            logger.error("Login may have failed — still on login page: {}", current_url)
            raise RuntimeError(f"X login failed, stuck at: {current_url}")
        logger.info("Login appears successful (current URL: {})", current_url)


async def _extract_tweets_from_page(page, min_likes: int) -> list[dict]:
    """Extract tweet data from the currently loaded search results page."""
    tweets: list[dict] = []

    tweet_articles = page.locator('article[data-testid="tweet"]')
    count = await tweet_articles.count()

    for i in range(count):
        try:
            article = tweet_articles.nth(i)

            # Extract tweet text
            text_el = article.locator('div[data-testid="tweetText"]')
            text = await text_el.inner_text(timeout=3000) if await text_el.count() > 0 else ""

            # Extract author
            author_el = article.locator('div[data-testid="User-Name"] a').first
            author_href = await author_el.get_attribute("href", timeout=3000) if await author_el.count() > 0 else ""
            author = author_href.strip("/").split("/")[-1] if author_href else "unknown"

            # Extract metrics (likes, retweets)
            likes = 0
            retweets = 0

            like_el = article.locator('button[data-testid="like"] span, button[data-testid="unlike"] span')
            if await like_el.count() > 0:
                like_text = await like_el.first.inner_text(timeout=2000)
                likes = _parse_metric(like_text)

            rt_el = article.locator('button[data-testid="retweet"] span, button[data-testid="unretweet"] span')
            if await rt_el.count() > 0:
                rt_text = await rt_el.first.inner_text(timeout=2000)
                retweets = _parse_metric(rt_text)

            if likes < min_likes:
                continue

            # Extract tweet ID from the article's link
            time_link = article.locator('a[href*="/status/"] time').first
            if await time_link.count() == 0:
                continue
            parent_link = article.locator('a[href*="/status/"]').first
            href = await parent_link.get_attribute("href", timeout=2000) or ""
            tweet_id = ""
            for part in href.split("/"):
                if part.isdigit() and len(part) > 10:
                    tweet_id = part
                    break

            if not tweet_id:
                continue

            tweets.append({
                "tweet_id": tweet_id,
                "text": text,
                "likes": likes,
                "retweets": retweets,
                "author": author,
            })
        except Exception as e:
            logger.debug("Failed to extract tweet {}: {}", i, e)
            continue

    return tweets


def _parse_metric(text: str) -> int:
    """Parse a metric string like '1.2K', '3.4M', or '500' into an integer."""
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
    """Scrape trending tweets from X search for the given genre.

    Parameters
    ----------
    account : dict
        Must contain ``x_username`` and ``x_password`` (decrypted).
    genre_config : dict
        Must contain ``search_keywords`` (list of strings).

    Returns
    -------
    list[dict]
        Each dict has: tweet_id, text, likes, retweets, author.
    """
    keywords = genre_config.get("search_keywords", [])
    if not keywords:
        logger.warning("No search keywords configured for genre — skipping X scrape")
        return []

    target_count = SCRAPE_CONFIG["x_target_count"]
    min_likes = SCRAPE_CONFIG["x_min_likes"]
    all_tweets: dict[str, dict] = {}  # keyed by tweet_id for dedup

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
            # --- Login ---
            await _login_to_x(page, account)

            # --- Search each keyword ---
            for keyword in keywords:
                if len(all_tweets) >= target_count:
                    break

                query = urllib.parse.quote(keyword)
                search_url = f"https://x.com/search?q={query}&f=top"
                logger.info("Searching X for: {} ({})", keyword, search_url)

                await page.goto(search_url, wait_until="domcontentloaded", timeout=30_000)
                await page.wait_for_timeout(3000)

                # Scroll to load more results
                max_scrolls = 5
                for scroll_idx in range(max_scrolls):
                    if len(all_tweets) >= target_count:
                        break

                    tweets = await _extract_tweets_from_page(page, min_likes)
                    for t in tweets:
                        if t["tweet_id"] not in all_tweets:
                            all_tweets[t["tweet_id"]] = t

                    logger.debug(
                        "Scroll {}/{}: found {} tweets so far",
                        scroll_idx + 1, max_scrolls, len(all_tweets),
                    )

                    # Scroll down
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
# Google Trends
# ---------------------------------------------------------------------------

async def collect_google_trends(genre_config: dict) -> list[str]:
    """Fetch trending searches from Google Trends (Japan).

    Uses pytrends to get real-time trending searches and filters
    by genre keywords when possible.

    Parameters
    ----------
    genre_config : dict
        Contains ``search_keywords`` for optional filtering.

    Returns
    -------
    list[str]
        Trending topic strings.
    """
    trends_count = SCRAPE_CONFIG["google_trends_count"]
    keywords = genre_config.get("search_keywords", [])

    try:
        pytrends = TrendReq(hl="ja-JP", tz=540)  # JST = UTC+9

        # Get real-time trending searches in Japan
        trending_df = pytrends.trending_searches(pn="japan")
        all_trends: list[str] = trending_df[0].tolist() if not trending_df.empty else []

        logger.info("Fetched {} trending searches from Google Trends", len(all_trends))

        # Filter by genre keywords if we have them
        if keywords and all_trends:
            filtered = [
                trend for trend in all_trends
                if any(kw.lower() in trend.lower() for kw in keywords)
            ]
            if filtered:
                logger.info("Filtered to {} genre-relevant trends", len(filtered))
                return filtered[:trends_count]

        # Return unfiltered trends if no matches
        return all_trends[:trends_count]

    except Exception as e:
        logger.error("Failed to fetch Google Trends: {}", e)
        return []


# ---------------------------------------------------------------------------
# AI trend analysis
# ---------------------------------------------------------------------------

async def analyze_trends(
    x_posts: list[dict],
    google_trends: list[str],
    genre_config: dict,
) -> dict:
    """Use OpenRouter AI to analyze collected trends and posts.

    Parameters
    ----------
    x_posts : list[dict]
        Collected tweets from X.
    google_trends : list[str]
        Trending topics from Google Trends.
    genre_config : dict
        Genre configuration with name and keywords.

    Returns
    -------
    dict
        Keys: top_topics, trend_summary, recommended_angle, keywords.
    """
    model = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-3-haiku")
    api_key = os.environ.get("OPENROUTER_API_KEY", "")

    if not api_key:
        logger.error("OPENROUTER_API_KEY not set — cannot analyze trends")
        return {
            "top_topics": [],
            "trend_summary": "",
            "recommended_angle": "",
            "keywords": [],
        }

    # Build context from collected data
    genre_name = genre_config.get("name", "general")
    genre_keywords = genre_config.get("search_keywords", [])

    tweets_summary = ""
    for i, post in enumerate(x_posts[:20], 1):  # Limit to 20 to save tokens
        tweets_summary += (
            f"{i}. @{post['author']} (likes: {post['likes']}, RT: {post['retweets']})\n"
            f"   {post['text'][:200]}\n\n"
        )

    trends_text = "\n".join(f"- {t}" for t in google_trends) if google_trends else "(no trends)"

    prompt = f"""あなたはSNSトレンド分析の専門家です。以下のデータを分析して、noteの有料記事にふさわしいトピックを提案してください。

## ジャンル: {genre_name}
## 関連キーワード: {', '.join(genre_keywords)}

## X (Twitter) でバズっている投稿:
{tweets_summary}

## Google Trends (日本):
{trends_text}

上記のデータを踏まえて、以下のJSON形式で回答してください:
{{
  "top_topics": ["トピック1", "トピック2", "トピック3"],
  "trend_summary": "現在のトレンドの要約（2-3文）",
  "recommended_angle": "noteの有料記事として書くべき切り口の提案",
  "keywords": ["キーワード1", "キーワード2", "キーワード3", "キーワード4", "キーワード5"]
}}

JSONのみを返してください。"""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                _OPENROUTER_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 1000,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        content = data["choices"][0]["message"]["content"]

        # Parse JSON from response (handle markdown code blocks)
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        result = json.loads(content)
        logger.info("Trend analysis complete: {} top topics", len(result.get("top_topics", [])))
        return result

    except json.JSONDecodeError as e:
        logger.error("Failed to parse AI trend analysis response: {}", e)
        return {
            "top_topics": [],
            "trend_summary": "",
            "recommended_angle": "",
            "keywords": [],
        }
    except Exception as e:
        logger.error("Failed to call OpenRouter for trend analysis: {}", e)
        return {
            "top_topics": [],
            "trend_summary": "",
            "recommended_angle": "",
            "keywords": [],
        }


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

async def run(account: dict, genre_config: dict) -> dict:
    """Orchestrate the full scraping + analysis pipeline.

    1. Collect trending tweets from X
    2. Collect Google Trends data
    3. Analyze trends with AI
    4. Save research to DB

    Parameters
    ----------
    account : dict
        Account data with x_username, x_password, user_id, id.
    genre_config : dict
        Genre configuration from genres.json.

    Returns
    -------
    dict
        Combined results with keys: x_posts, google_trends, analysis.
    """
    genre_name = genre_config.get("name", "unknown")
    logger.info("Starting scraper pipeline for genre '{}', account '{}'",
                genre_name, account.get("name", account.get("id", "unknown")))

    # --- Step 1: Collect X posts ---
    x_posts = await collect_x_posts(account, genre_config)
    logger.info("Collected {} X posts", len(x_posts))

    # --- Step 2: Collect Google Trends ---
    google_trends = await collect_google_trends(genre_config)
    logger.info("Collected {} Google Trends topics", len(google_trends))

    # --- Step 3: Analyze trends ---
    analysis = await analyze_trends(x_posts, google_trends, genre_config)

    # --- Step 4: Save research to DB ---
    try:
        cycle = datetime.now(timezone.utc).strftime("%Y%m%d_%H")
        tweet_rows = [
            {
                "tweet_id": post["tweet_id"],
                "author": post["author"],
                "content": post["text"],
                "metrics": {
                    "likes": post["likes"],
                    "retweets": post["retweets"],
                },
            }
            for post in x_posts
        ]
        db.save_research(
            user_id=account["user_id"],
            account_id=account["id"],
            cycle=cycle,
            tweets=tweet_rows,
        )
    except Exception as e:
        logger.error("Failed to save research to DB: {}", e)

    result = {
        "x_posts": x_posts,
        "google_trends": google_trends,
        "analysis": analysis,
    }
    logger.info("Scraper pipeline complete for genre '{}'", genre_name)
    return result
