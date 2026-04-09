"""Generate natural reply text using AI (OpenRouter API).

Builds a prompt from the reply context, strategy, and genre, then calls the
OpenRouter chat completion endpoint to produce a concise reply.
"""

from __future__ import annotations

import os

import httpx
from loguru import logger

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

REPLY_STRATEGIES = {
    "positive": "共感を示し、次の記事へ自然に誘導する",
    "question": "簡潔に答え、詳細はnote記事URLを案内する",
    "skeptical": "根拠を補足し、信頼感を高める",
    "negative": "丁寧に受け止め、改善の意志を示す",
    "neutral": "フレンドリーに会話を続ける",
}

REPLY_PROMPT_TEMPLATE = """\
あなたはX（旧Twitter）で活動する{genre}ジャンルのインフルエンサーです。

以下のリプライに対して、自然な日本語で返信を生成してください。

## 元ツイート
{original_tweet}

## 受け取ったリプライ
@{reply_author}: {reply_text}

## リプライの分類
タイプ: {reply_type}

## 返信戦略
{strategy}

## ルール
- 100文字以内で返信すること（厳守）
- 自然な口語体で書くこと
- 宣伝臭くならないこと
- 相手の名前（@メンション）は含めないこと
- ハッシュタグは使わないこと
- 絵文字は最大1つまで
"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_prompt(
    reply: dict,
    reply_type: str,
    genre_config: dict,
) -> str:
    """Build the system/user prompt for the AI model."""
    genre = genre_config.get("name", "general")
    strategy = REPLY_STRATEGIES.get(reply_type, REPLY_STRATEGIES["neutral"])
    original_tweet = reply.get("original_tweet_text", "(元ツイート不明)")
    reply_text = reply.get("reply_text", "")
    reply_author = reply.get("author", "unknown")

    prompt = REPLY_PROMPT_TEMPLATE.format(
        genre=genre,
        original_tweet=original_tweet,
        reply_author=reply_author,
        reply_text=reply_text,
        reply_type=reply_type,
        strategy=strategy,
    )
    return prompt


async def _call_openrouter(prompt: str) -> str:
    """Call the OpenRouter API and return the generated text.

    Uses ``OPENROUTER_API_KEY`` and ``OPENROUTER_MODEL`` from environment.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    model = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-3-haiku")

    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://note-auto.app",
        "X-Title": "X-note-auto",
    }

    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "あなたはSNS返信の専門家です。"
                    "指示に従い、簡潔で自然な返信を生成してください。"
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        "max_tokens": 200,
        "temperature": 0.7,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                OPENROUTER_API_URL,
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        choices = data.get("choices", [])
        if not choices:
            logger.error("OpenRouter returned no choices")
            raise RuntimeError("OpenRouter returned empty response")

        text = choices[0]["message"]["content"].strip()
        logger.debug(f"OpenRouter raw response: {text}")
        return text

    except httpx.HTTPStatusError as e:
        logger.error(
            f"OpenRouter HTTP error {e.response.status_code}: {e.response.text}"
        )
        raise
    except httpx.RequestError as e:
        logger.error(f"OpenRouter request failed: {e}")
        raise


def _enforce_length(text: str, max_chars: int = 100) -> str:
    """Ensure the generated reply is within the character limit.

    Truncates with ellipsis if necessary.
    """
    text = text.strip().strip('"').strip("'").strip()

    if len(text) <= max_chars:
        return text

    # Truncate to max_chars - 1 and add ellipsis
    truncated = text[: max_chars - 1] + "…"
    logger.warning(
        f"Reply truncated from {len(text)} to {len(truncated)} chars"
    )
    return truncated


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def run(
    account: dict,
    reply: dict,
    reply_type: str,
    genre_config: dict,
) -> str:
    """Generate a natural reply using AI.

    Parameters
    ----------
    account : dict
        Account data (used for context; not sent to the API).
    reply : dict
        Reply data containing ``reply_text``, ``author``, and
        optionally ``original_tweet_text``.
    reply_type : str
        Classification type (``"positive"``, ``"question"``,
        ``"skeptical"``, ``"negative"``, ``"neutral"``).
    genre_config : dict
        Genre configuration with ``name`` and ``reply_style``.

    Returns
    -------
    str
        Generated reply text, guaranteed to be under 100 characters.
    """
    logger.info(
        f"Generating {reply_type} reply for @{reply.get('author', '?')} "
        f"(genre={genre_config.get('name', '?')})"
    )

    prompt = _build_prompt(reply, reply_type, genre_config)
    raw_reply = await _call_openrouter(prompt)
    final_reply = _enforce_length(raw_reply, max_chars=100)

    logger.info(f"Generated reply ({len(final_reply)} chars): {final_reply}")
    return final_reply
