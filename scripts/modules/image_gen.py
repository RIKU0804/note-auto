"""Image generation via OpenAI Images API (gpt-image-2 by default).

The model returns base64-encoded PNG bytes which we hand back to the
caller; the X poster is responsible for uploading those bytes via
tweepy's v1.1 ``media_upload`` endpoint.
"""

from __future__ import annotations

import base64
import os
from typing import Optional

from loguru import logger
from openai import OpenAI

_DEFAULT_MODEL = "gpt-image-2"
_DEFAULT_SIZE = "1024x1024"


def _client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=api_key)


def _render_prompt(template: str, context: dict) -> str:
    """Best-effort template render with named placeholders.

    Unknown placeholders are kept verbatim so a misspelled key shows up in
    the generated image's filename rather than silently corrupting the
    prompt.
    """
    try:
        return template.format(**context)
    except KeyError as e:
        logger.warning("image prompt placeholder missing: {}", e)
        return template


def build_prompt(genre_config: dict, analysis: dict, tweet_text: str) -> str:
    """Compose the final prompt fed to the Images API.

    Order of precedence:
      1. genre_config["image_prompt"] template, formatted with the
         tweet text / top topic for context.
      2. A neutral lifestyle fallback so the generator never receives
         an empty prompt.
    """
    template = genre_config.get("image_prompt")
    top_topic = ""
    topics = analysis.get("top_topics") or []
    if topics:
        top_topic = str(topics[0])

    context = {
        "genre": genre_config.get("name", "lifestyle"),
        "label": genre_config.get("label", genre_config.get("name", "lifestyle")),
        "tweet": (tweet_text or "")[:120],
        "topic": top_topic,
    }

    if template:
        return _render_prompt(template, context)

    return (
        "Editorial lifestyle photograph, soft natural lighting, "
        "subtle color grading, magazine-quality composition. "
        f"Theme: {context['label']}. Mood reference: {context['tweet']}"
    ).strip()


def generate_image(
    prompt: str,
    *,
    model: Optional[str] = None,
    size: str = _DEFAULT_SIZE,
) -> bytes:
    """Generate a single image and return its raw PNG bytes."""
    client = _client()
    model = model or os.environ.get("OPENAI_IMAGE_MODEL", _DEFAULT_MODEL)

    logger.info("Generating image via {} ({} chars prompt)", model, len(prompt))
    response = client.images.generate(
        model=model,
        prompt=prompt,
        size=size,
        n=1,
    )

    data = response.data[0]
    b64 = getattr(data, "b64_json", None)
    if not b64:
        # Some image models can also return a URL; we deliberately do not
        # follow URLs to keep the worker self-contained.
        raise RuntimeError(
            "Image response did not include b64_json — set response_format or "
            "use a model that supports inline base64."
        )
    return base64.b64decode(b64)
