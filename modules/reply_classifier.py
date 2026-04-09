"""Classify X replies as spam or categorize them by sentiment/intent.

Uses keyword-based pattern matching against predefined lists.
"""

from __future__ import annotations

from loguru import logger

# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

SKIP_PATTERNS = [
    "フォロバ",
    "相互",
    "宣伝",
    "follow",
    "http://",
    "https://",
    "DM",
    "LINE",
]

REPLY_TYPES = {
    "positive": ["ありがとう", "参考", "勉強", "助かる"],
    "question": ["教えて", "どうやって", "方法", "詳しく"],
    "skeptical": ["本当", "嘘", "信じられない", "怪しい"],
    "negative": ["最悪", "ひどい", "むかつく"],
}


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def classify(reply_text: str) -> dict:
    """Classify a reply by checking against spam patterns and type keywords.

    Parameters
    ----------
    reply_text : str
        The text content of the reply.

    Returns
    -------
    dict
        ``{"is_spam": True, "type": "spam"}`` if the reply matches a
        skip pattern.  Otherwise ``{"is_spam": False, "type": <type>}``
        where *type* is one of ``"positive"``, ``"question"``,
        ``"skeptical"``, ``"negative"``, or ``"neutral"``.
    """
    if not reply_text:
        logger.debug("Empty reply text — classifying as neutral")
        return {"is_spam": False, "type": "neutral"}

    text_lower = reply_text.lower()

    # --- Spam check ---
    for pattern in SKIP_PATTERNS:
        if pattern.lower() in text_lower:
            logger.debug(f"Reply matched spam pattern '{pattern}': {reply_text[:60]}...")
            return {"is_spam": True, "type": "spam"}

    # --- Type classification ---
    # Score each type by how many keywords match
    scores: dict[str, int] = {}
    for reply_type, keywords in REPLY_TYPES.items():
        score = sum(1 for kw in keywords if kw in reply_text)
        if score > 0:
            scores[reply_type] = score

    if scores:
        # Pick the type with the highest score
        best_type = max(scores, key=scores.get)  # type: ignore[arg-type]
        logger.debug(
            f"Reply classified as '{best_type}' (scores={scores}): {reply_text[:60]}..."
        )
        return {"is_spam": False, "type": best_type}

    # --- Fallback ---
    logger.debug(f"Reply classified as 'neutral': {reply_text[:60]}...")
    return {"is_spam": False, "type": "neutral"}
