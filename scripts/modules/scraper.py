"""Collect trending tweets from X and analyze them with AI.

Switched from Playwright (ToS-violating headless login) to the official
X API V2 Recent Search endpoint via tweepy. The Trends API is no longer
available on Free tier, so we approximate "trending" content for a genre
by querying high-engagement tweets for the genre's pre-defined keywords.

Free tier budget: 1,500 tweet reads / month per project — this module
caps per-genre fetches accordingly.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

import httpx
import tweepy
from loguru import logger

from modules import db

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SCRAPE_CONFIG = {
    "x_target_count": 10,            # tweets per cycle (Free-tier conscious)
    "x_per_keyword": 5,              # tweets per keyword
    "x_min_likes": 50,
    "x_recent_max_results": 10,      # max_results per search call (10..100)
}

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ---------------------------------------------------------------------------
# X API V2 — Recent Search
# ---------------------------------------------------------------------------

def _bearer_token_for(account: dict) -> str | None:
    """Pick the best Bearer Token available.

    Account-specific tokens are preferred; fall back to a project-wide
    ``X_BEARER_TOKEN`` env var so a shared scraper key can serve all users.
    Caller is expected to pass a decrypted account dict.
    """
    return account.get("x_bearer_token") or os.environ.get("X_BEARER_TOKEN")


def _build_search_query(keyword: str) -> str:
    """Compose a Recent Search query: Japanese, no retweets, has engagement."""
    kw = keyword.strip()
    if " " in kw:
        kw = f'"{kw}"'
    return f"{kw} lang:ja -is:retweet"


def _search_recent_for_keyword_sync(
    client: tweepy.Client, keyword: str, per_keyword: int, min_likes: int
) -> list[dict[str, Any]]:
    """Synchronous tweepy call. Wrapped by ``asyncio.to_thread`` from the
    async caller so the event loop is not blocked."""
    query = _build_search_query(keyword)
    max_results = max(10, min(SCRAPE_CONFIG["x_recent_max_results"], 100))

    try:
        resp = client.search_recent_tweets(
            query=query,
            max_results=max_results,
            tweet_fields=["public_metrics", "author_id", "created_at"],
        )
    except tweepy.TooManyRequests as e:
        logger.warning("X API rate limit hit during scrape ({}): {}", keyword, e)
        return []
    except tweepy.TweepyException as e:
        logger.error("X API search failed for '{}': {}", keyword, e)
        return []

    data = getattr(resp, "data", None) or []
    rows: list[dict[str, Any]] = []
    for tweet in data:
        metrics = getattr(tweet, "public_metrics", None) or {}
        likes = int(metrics.get("like_count", 0) or 0)
        retweets = int(metrics.get("retweet_count", 0) or 0)
        if likes < min_likes:
            continue
        rows.append(
            {
                "tweet_id": str(getattr(tweet, "id", "")),
                "text": getattr(tweet, "text", "") or "",
                "likes": likes,
                "retweets": retweets,
                "author": str(getattr(tweet, "author_id", "") or "unknown"),
            }
        )
        if len(rows) >= per_keyword:
            break

    logger.info("Recent search '{}': {} tweet(s) above {} likes", keyword, len(rows), min_likes)
    return rows


async def collect_x_posts(account: dict, genre_config: dict) -> list[dict[str, Any]]:
    """Fetch genre-relevant tweets via Recent Search API."""
    keywords: list[str] = genre_config.get("search_keywords", []) or []
    if not keywords:
        logger.warning("No search keywords configured — skipping X scrape")
        return []

    bearer = _bearer_token_for(account)
    if not bearer:
        logger.error(
            "No X Bearer Token available for account '{}'. "
            "Set x_bearer_token on the account or X_BEARER_TOKEN in env.",
            account.get("name", account.get("id", "?")),
        )
        return []

    client = tweepy.Client(bearer_token=bearer, wait_on_rate_limit=False)

    target = SCRAPE_CONFIG["x_target_count"]
    per_kw = SCRAPE_CONFIG["x_per_keyword"]
    min_likes = SCRAPE_CONFIG["x_min_likes"]

    seen: dict[str, dict[str, Any]] = {}
    for keyword in keywords:
        if len(seen) >= target:
            break
        rows = await asyncio.to_thread(
            _search_recent_for_keyword_sync, client, keyword, per_kw, min_likes
        )
        for row in rows:
            tid = row["tweet_id"]
            if tid and tid not in seen:
                seen[tid] = row

    result = list(seen.values())[:target]
    logger.info("Collected {} tweet(s) via X API Recent Search", len(result))
    return result


# ---------------------------------------------------------------------------
# AI trend analysis
# ---------------------------------------------------------------------------

def _strip_code_fence(content: str) -> str:
    s = content.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.endswith("```"):
            s = s[:-3]
        s = s.strip()
    return s


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

        content = _strip_code_fence(data["choices"][0]["message"]["content"])
        result = json.loads(content)
        logger.info("Trend analysis complete: {} topics", len(result.get("top_topics", [])))
        return result

    except Exception as e:
        logger.error("Failed to analyze trends: {}", e)
        return {"top_topics": [], "trend_summary": "", "keywords": []}


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

async def run(account: dict, genre_config: dict, cycle: str) -> dict:
    """Collect X trends and analyze them with AI.

    Returns dict with keys: x_posts, analysis
    """
    genre_name = genre_config.get("name", "unknown")
    logger.info(
        "Starting scraper for genre '{}', account '{}', cycle '{}'",
        genre_name,
        account.get("name", account.get("id", "unknown")),
        cycle,
    )

    x_posts = await collect_x_posts(account, genre_config)
    logger.info("Collected {} X posts", len(x_posts))

    analysis = await analyze_trends(x_posts, genre_config)

    try:
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
