"""Mock-only tests for the X API V2 path of x_poster.

No real network calls. Uses unittest.mock to stub tweepy.Client.
Run from the repo root with:

    cd scripts && python -m pytest tests/test_x_poster.py -v

Falls back to running as a module (no pytest required) — see __main__ block.
"""

from __future__ import annotations

import asyncio
import os
import sys
import types
import unittest
from unittest.mock import MagicMock, patch

# Make `modules` importable when run from scripts/
_HERE = os.path.dirname(os.path.abspath(__file__))
_SCRIPTS = os.path.dirname(_HERE)
if _SCRIPTS not in sys.path:
    sys.path.insert(0, _SCRIPTS)

from modules import x_poster  # noqa: E402


def _make_account(**overrides) -> dict:
    base = {
        "id": "00000000-0000-0000-0000-000000000001",
        "user_id": "00000000-0000-0000-0000-000000000000",
        "name": "test-account",
        "x_username": "testuser",
        "x_bearer_token": "BEARER-TOKEN",
        "x_api_key": "consumer-key",
        "x_api_secret": "consumer-secret",
        "x_access_token": "access-token",
        "x_access_token_secret": "access-token-secret",
    }
    base.update(overrides)
    return base


def _fake_response(tweet_id: str = "1234567890") -> types.SimpleNamespace:
    return types.SimpleNamespace(data={"id": tweet_id})


class PostTweetApiTests(unittest.TestCase):
    """Verify the API path returns the new dict shape and respects truncation."""

    def setUp(self) -> None:
        os.environ["X_CLIENT"] = "api"

    def test_post_tweet_returns_tweet_id_and_posted_at(self) -> None:
        account = _make_account()
        fake_client = MagicMock()
        fake_client.create_tweet.return_value = _fake_response("9999000111222333")

        with patch("modules.x_poster.tweepy.Client", return_value=fake_client) as ctor:
            result = asyncio.run(x_poster.post_tweet(account, "hello world"))

        ctor.assert_called_once()
        kwargs = ctor.call_args.kwargs
        self.assertEqual(kwargs["bearer_token"], "BEARER-TOKEN")
        self.assertEqual(kwargs["consumer_key"], "consumer-key")
        self.assertEqual(kwargs["consumer_secret"], "consumer-secret")
        self.assertEqual(kwargs["access_token"], "access-token")
        self.assertEqual(kwargs["access_token_secret"], "access-token-secret")
        self.assertFalse(kwargs["wait_on_rate_limit"])

        fake_client.create_tweet.assert_called_once_with(text="hello world")
        # media_ids must not be present for text-only posts.
        self.assertNotIn(
            "media_ids", fake_client.create_tweet.call_args.kwargs,
        )
        self.assertIsInstance(result, dict)
        self.assertEqual(result["tweet_id"], "9999000111222333")
        self.assertIn("posted_at", result)
        self.assertTrue(result["posted_at"])

    def test_post_tweet_truncates_long_text(self) -> None:
        account = _make_account()
        fake_client = MagicMock()
        fake_client.create_tweet.return_value = _fake_response("1")

        long_text = "あ" * 500
        with patch("modules.x_poster.tweepy.Client", return_value=fake_client):
            asyncio.run(x_poster.post_tweet(account, long_text))

        sent = fake_client.create_tweet.call_args.kwargs["text"]
        self.assertEqual(len(sent), x_poster._MAX_TWEET_LEN)
        self.assertTrue(sent.endswith("…"))

    def test_post_tweet_raises_when_no_credentials(self) -> None:
        account = _make_account(
            x_bearer_token=None,
            x_api_key=None,
            x_api_secret=None,
            x_access_token=None,
            x_access_token_secret=None,
        )
        with self.assertRaises(RuntimeError):
            asyncio.run(x_poster.post_tweet(account, "hi"))

    def test_post_tweet_propagates_rate_limit(self) -> None:
        import tweepy

        account = _make_account()
        fake_client = MagicMock()
        fake_response = MagicMock()
        fake_response.status_code = 429
        fake_response.json.return_value = {
            "errors": [{"message": "Rate limit exceeded"}]
        }
        fake_response.headers = {}
        fake_client.create_tweet.side_effect = tweepy.TooManyRequests(fake_response)

        with patch("modules.x_poster.tweepy.Client", return_value=fake_client):
            with self.assertRaises(tweepy.TooManyRequests):
                asyncio.run(x_poster.post_tweet(account, "hi"))

    def test_post_tweet_raises_when_response_has_no_id(self) -> None:
        account = _make_account()
        fake_client = MagicMock()
        fake_client.create_tweet.return_value = types.SimpleNamespace(data=None)

        with patch("modules.x_poster.tweepy.Client", return_value=fake_client):
            with self.assertRaises(RuntimeError):
                asyncio.run(x_poster.post_tweet(account, "hi"))


class ClientModeTests(unittest.TestCase):
    def test_unknown_mode_falls_back_to_api(self) -> None:
        with patch.dict(os.environ, {"X_CLIENT": "ouija"}):
            self.assertEqual(x_poster._client_mode(), "api")

    def test_api_is_default(self) -> None:
        env = dict(os.environ)
        env.pop("X_CLIENT", None)
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(x_poster._client_mode(), "api")

    def test_playwright_mode_recognised(self) -> None:
        with patch.dict(os.environ, {"X_CLIENT": "playwright"}):
            self.assertEqual(x_poster._client_mode(), "playwright")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
