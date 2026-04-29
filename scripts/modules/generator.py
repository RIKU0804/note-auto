"""Generate X (Twitter) post text using OpenRouter API based on trending topics."""

from __future__ import annotations

import os

import httpx
from loguru import logger

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

_PROMPT_TEMPLATE = """\
あなたはX(旧Twitter)で活動する{genre}ジャンルのインフルエンサーです。

## 現在のトレンドトピック:
{top_topics}

## トレンドの要約:
{trend_summary}

## 投稿スタイル:
{article_style}

以下の条件でXの投稿文を1件生成してください:
- 日本語で140文字以内（厳守）
- トレンドに関連した、フォロワーの役に立つ内容
- ハッシュタグを2〜3個含める
- 自然な口語体（AI感を出さない）
- 宣伝臭くない

投稿文のみ返してください（説明・前置き不要）。
"""


async def run(account: dict, research: dict, cycle: str, genre_config: dict) -> dict:
    """Generate an X post based on trend research.

    Returns
    -------
    dict
        Keys: tweet_text, cycle
    """
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    model = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-3-haiku")

    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set")

    analysis = research.get("analysis", {})
    genre = genre_config.get("name", "general")
    top_topics = "\n".join(f"- {t}" for t in analysis.get("top_topics", []))
    trend_summary = analysis.get("trend_summary", "")
    article_style = genre_config.get("article_style", "")

    prompt = _PROMPT_TEMPLATE.format(
        genre=genre,
        top_topics=top_topics or "(トピックなし)",
        trend_summary=trend_summary or "(要約なし)",
        article_style=article_style,
    )

    logger.info("Generating X post for genre '{}', cycle '{}'", genre, cycle)

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
                    "max_tokens": 300,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        tweet_text = data["choices"][0]["message"]["content"].strip().strip('"').strip("'")

        if len(tweet_text) > 280:
            tweet_text = tweet_text[:279] + "…"
            logger.warning("Tweet truncated to 280 chars")

        logger.info("Generated tweet ({} chars): {}…", len(tweet_text), tweet_text[:50])
        return {"tweet_text": tweet_text, "cycle": cycle}

    except Exception as e:
        logger.error("Failed to generate X post: {}", e)
        raise
