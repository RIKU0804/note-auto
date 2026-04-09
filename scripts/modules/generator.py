"""Generate note articles using OpenRouter API.

Builds prompts from trend analysis data and genre configuration,
calls an LLM via OpenRouter, and parses the response into structured
article components (title, free preview, paid content).
"""

from __future__ import annotations

import json
import os

import httpx
from loguru import logger

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OPENROUTER_CONFIG = {
    "model_env": "OPENROUTER_MODEL",
    "default_model": "anthropic/claude-3-haiku",
    "max_tokens": 2000,
    "fallback_model": "openai/gpt-4o-mini",
}

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------

NOTE_PROMPT_TEMPLATE = """\
あなたはプロのライターです。以下の情報を基に、noteの有料記事を生成してください。

## ジャンル: {genre}

## トレンド分析:
{trend_summary}

## 推奨切り口:
{recommended_angle}

## 関連キーワード:
{keywords}

## 記事スタイル:
{article_style}

## 出力形式:
以下のJSON形式で、完全な記事を生成してください。

{{
  "title": "記事タイトル（30文字以内、興味を引くもの）",
  "content_free": "無料公開部分（400-600文字）。読者を引き込み、続きを読みたくなるような導入。問題提起や共感を生む内容。最後に「ここから先は有料です」的な区切りを自然に入れる。",
  "content_paid": "有料部分（1500-2500文字）。具体的なノウハウ、データ、体験談、アクションプラン等を含む価値の高いコンテンツ。見出しを適切に使い、読みやすく構成する。"
}}

## 重要な注意事項:
- タイトルはSEOを意識しつつ、クリックしたくなるものにする
- 無料部分で読者の興味を最大限に引く
- 有料部分は「買ってよかった」と思える具体的な価値を提供する
- 自然な日本語で書く（AI感を出さない）
- Markdown記法を適切に使う（見出し、箇条書き、太字等）
- JSONのみを返すこと
"""


# ---------------------------------------------------------------------------
# OpenRouter API call
# ---------------------------------------------------------------------------

async def call_openrouter(
    prompt: str,
    model: str | None = None,
    max_tokens: int = 2000,
) -> str:
    """Call OpenRouter API and return the response text.

    Parameters
    ----------
    prompt : str
        The user prompt to send.
    model : str, optional
        Model identifier. Falls back to env var or default.
    max_tokens : int
        Maximum tokens in the response.

    Returns
    -------
    str
        The assistant's response text.

    Raises
    ------
    RuntimeError
        If both primary and fallback model calls fail.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY environment variable is not set")

    if model is None:
        model = os.environ.get(
            OPENROUTER_CONFIG["model_env"],
            OPENROUTER_CONFIG["default_model"],
        )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
    }

    # --- Primary model attempt ---
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(_OPENROUTER_URL, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        text = data["choices"][0]["message"]["content"]
        logger.debug("OpenRouter response received ({} model, {} chars)", model, len(text))
        return text

    except Exception as primary_err:
        logger.warning("Primary model '{}' failed: {} — trying fallback", model, primary_err)

    # --- Fallback model attempt ---
    fallback_model = OPENROUTER_CONFIG["fallback_model"]
    if fallback_model == model:
        raise RuntimeError(f"OpenRouter call failed (no distinct fallback): {primary_err}")

    payload["model"] = fallback_model
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(_OPENROUTER_URL, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        text = data["choices"][0]["message"]["content"]
        logger.info("Fallback model '{}' succeeded ({} chars)", fallback_model, len(text))
        return text

    except Exception as fallback_err:
        raise RuntimeError(
            f"Both primary ({model}) and fallback ({fallback_model}) models failed. "
            f"Primary error: {primary_err} | Fallback error: {fallback_err}"
        )


# ---------------------------------------------------------------------------
# Article generation
# ---------------------------------------------------------------------------

def _parse_article_json(raw: str) -> dict:
    """Parse article JSON from LLM response, handling markdown code blocks."""
    text = raw.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

    return json.loads(text)


async def run(
    account: dict,
    research: dict,
    cycle: str,
    genre_config: dict,
) -> dict:
    """Generate a note article from research data.

    Parameters
    ----------
    account : dict
        Account data (used for context/logging).
    research : dict
        Output from ``scraper.run()`` — must contain an ``analysis`` key
        with: trend_summary, recommended_angle, keywords.
    cycle : str
        Current cycle identifier (e.g. ``"20260410_09"``).
    genre_config : dict
        Genre configuration with name, article_style, note_price.

    Returns
    -------
    dict
        Keys: title, content_free, content_paid, note_price.
    """
    genre = genre_config.get("name", "general")
    analysis = research.get("analysis", {})

    trend_summary = analysis.get("trend_summary", "")
    recommended_angle = analysis.get("recommended_angle", "")
    keywords_list = analysis.get("keywords", [])
    keywords_str = ", ".join(keywords_list) if keywords_list else ""
    article_style = genre_config.get("article_style", "")

    logger.info(
        "Generating note article for genre '{}', cycle '{}', account '{}'",
        genre, cycle, account.get("name", account.get("id", "unknown")),
    )

    # --- Build the prompt ---
    prompt = NOTE_PROMPT_TEMPLATE.format(
        genre=genre,
        trend_summary=trend_summary,
        recommended_angle=recommended_angle,
        keywords=keywords_str,
        article_style=article_style,
    )

    # --- Call OpenRouter ---
    raw_response = await call_openrouter(
        prompt=prompt,
        max_tokens=OPENROUTER_CONFIG["max_tokens"],
    )

    # --- Parse the response ---
    try:
        article = _parse_article_json(raw_response)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse article JSON from LLM response: {}", e)
        logger.debug("Raw response (first 500 chars): {}", raw_response[:500])

        # Attempt a simpler extraction as fallback
        article = {
            "title": f"{genre} - 最新トレンド解説",
            "content_free": raw_response[:600] if raw_response else "",
            "content_paid": raw_response[600:] if len(raw_response) > 600 else "",
        }
        logger.warning("Used raw response as fallback article content")

    title = article.get("title", f"{genre} - 最新トレンド解説")
    content_free = article.get("content_free", "")
    content_paid = article.get("content_paid", "")
    note_price = genre_config.get("note_price", 500)

    logger.info(
        "Article generated: '{}' (free: {} chars, paid: {} chars, price: {})",
        title, len(content_free), len(content_paid), note_price,
    )

    return {
        "title": title,
        "content_free": content_free,
        "content_paid": content_paid,
        "note_price": note_price,
    }
