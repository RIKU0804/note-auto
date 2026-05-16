"""Generate X (Twitter) post text using the OpenAI API based on trending topics."""

from __future__ import annotations

import os

from loguru import logger
from openai import OpenAI

_DEFAULT_MODEL = "gpt-4o-mini"

# Japanese tweets are billed at 2 weighted chars per code point, so the
# effective Japanese-character ceiling on X is 140. The dashboard surfaces
# this same limit to users, so we truncate accordingly.
_MAX_TWEET_LEN = 140

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


def _client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=api_key)


async def run(account: dict, research: dict, cycle: str, genre_config: dict) -> dict:
    """Generate an X post based on trend research.

    Returns
    -------
    dict
        Keys: tweet_text, cycle
    """
    model = os.environ.get("OPENAI_TEXT_MODEL", _DEFAULT_MODEL)

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

    logger.info("Generating X post via {} for genre '{}', cycle '{}'", model, genre, cycle)

    client = _client()
    try:
        # The OpenAI SDK is synchronous; the surrounding worker runs us
        # off the event loop in a thread implicitly via asyncio.gather +
        # asyncio.to_thread for blocking tweepy calls. For OpenAI we keep
        # it sync because httpx pooling lives inside the SDK.
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
        )
        tweet_text = (response.choices[0].message.content or "").strip().strip('"').strip("'")
    except Exception as e:
        logger.error("Failed to generate X post: {}", e)
        raise

    if len(tweet_text) > _MAX_TWEET_LEN:
        tweet_text = tweet_text[: _MAX_TWEET_LEN - 1] + "…"
        logger.warning("Tweet truncated to {} chars", _MAX_TWEET_LEN)

    logger.info("Generated tweet ({} chars): {}…", len(tweet_text), tweet_text[:50])
    return {"tweet_text": tweet_text, "cycle": cycle}
