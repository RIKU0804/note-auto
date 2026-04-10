"""Classify X replies as spam or categorize them by sentiment/intent.

Uses keyword-based pattern matching against predefined lists.
"""

from __future__ import annotations

import re

from loguru import logger

# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

# Japanese spam phrases — matched as-is (case-sensitive substring).
JP_SKIP_PATTERNS = [
    "フォロバ",
    "相互",
    "宣伝",
]

# URL / scheme markers — case-insensitive substring match is fine here.
URL_SKIP_PATTERNS = [
    "http://",
    "https://",
]

# English acronyms that must match as standalone words, not substrings.
# Using these as plain substrings caused false positives inside words like
# "online", "deadline", "follower", etc.
WORD_SKIP_PATTERNS = [
    "DM",
    "LINE",
    "follow",
]

# Pre-compile a single alternation with word boundaries for WORD_SKIP_PATTERNS.
# \b doesn't play nicely with Japanese, but these patterns are all ASCII.
_WORD_SKIP_RE = re.compile(
    r"(?<![A-Za-z])(?:" + "|".join(re.escape(p) for p in WORD_SKIP_PATTERNS) + r")(?![A-Za-z])",
    re.IGNORECASE,
)

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

    # --- Spam check ---
    # 1) Japanese phrases — case-sensitive substring. Lowercasing Japanese
    #    text is a no-op at best and can corrupt full-width ASCII at worst.
    for pattern in JP_SKIP_PATTERNS:
        if pattern in reply_text:
            logger.debug(f"Reply matched JP spam pattern '{pattern}': {reply_text[:60]}...")
            return {"is_spam": True, "type": "spam"}

    # 2) URL markers — safe to lowercase just for this check.
    text_lower = reply_text.lower()
    for pattern in URL_SKIP_PATTERNS:
        if pattern in text_lower:
            logger.debug(f"Reply matched URL spam pattern '{pattern}': {reply_text[:60]}...")
            return {"is_spam": True, "type": "spam"}

    # 3) English acronyms — word-boundary match so "online"/"deadline" don't
    #    get flagged by "LINE", and "follower" doesn't get flagged by "follow".
    word_match = _WORD_SKIP_RE.search(reply_text)
    if word_match:
        logger.debug(
            f"Reply matched word spam pattern '{word_match.group(0)}': {reply_text[:60]}..."
        )
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
