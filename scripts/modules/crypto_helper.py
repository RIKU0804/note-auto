"""Symmetric encryption helper for at-rest secrets.

Mirrors src/lib/crypto.ts so the dashboard and the worker can round-trip
the same ciphertext format:

    "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>"

Key: env ``ENCRYPTION_KEY``, 32 bytes hex-encoded.

If ``ENCRYPTION_KEY`` is unset the helpers degrade to passthrough so a
partial rollout (dashboard encrypts, worker doesn't have the key yet)
fails loudly rather than silently corrupting data.
"""

from __future__ import annotations

import base64
import os
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from loguru import logger

_VERSION = "v1"
_KEY_LEN = 32
_warned = False


def _load_key() -> Optional[bytes]:
    global _warned
    raw = os.environ.get("ENCRYPTION_KEY")
    if not raw:
        if not _warned:
            logger.warning(
                "ENCRYPTION_KEY is not set — secrets will be read as plaintext."
            )
            _warned = True
        return None
    key = bytes.fromhex(raw)
    if len(key) != _KEY_LEN:
        raise RuntimeError(
            f"ENCRYPTION_KEY must be {_KEY_LEN} bytes hex-encoded "
            f"(got {len(key)})."
        )
    return key


def is_encrypted(value: str) -> bool:
    return value.startswith(f"{_VERSION}:")


def encrypt_secret(plaintext: str) -> str:
    if not plaintext or is_encrypted(plaintext):
        return plaintext
    key = _load_key()
    if key is None:
        return plaintext
    aes = AESGCM(key)
    iv = os.urandom(12)
    ct_and_tag = aes.encrypt(iv, plaintext.encode("utf-8"), None)
    # AESGCM returns ciphertext || tag (16 bytes tag).
    ct, tag = ct_and_tag[:-16], ct_and_tag[-16:]
    return ":".join(
        [
            _VERSION,
            base64.b64encode(iv).decode("ascii"),
            base64.b64encode(tag).decode("ascii"),
            base64.b64encode(ct).decode("ascii"),
        ]
    )


def decrypt_secret(blob: Optional[str]) -> Optional[str]:
    if not blob:
        return blob
    if not is_encrypted(blob):
        return blob
    key = _load_key()
    if key is None:
        raise RuntimeError(
            "Encountered an encrypted value but ENCRYPTION_KEY is not configured."
        )
    parts = blob.split(":")
    if len(parts) != 4:
        raise RuntimeError("Malformed encrypted secret.")
    _, iv_b64, tag_b64, ct_b64 = parts
    iv = base64.b64decode(iv_b64)
    tag = base64.b64decode(tag_b64)
    ct = base64.b64decode(ct_b64)
    aes = AESGCM(key)
    return aes.decrypt(iv, ct + tag, None).decode("utf-8")


def decrypt_account_secrets(account: dict) -> dict:
    """Return a shallow copy of *account* with sensitive fields decrypted.

    Mutates only the returned dict, never the caller's. Unknown / missing
    fields are passed through untouched.
    """
    secret_fields = (
        "x_bearer_token",
        "x_api_key",
        "x_api_secret",
        "x_access_token",
        "x_access_token_secret",
        "x_password_enc",
    )
    out = dict(account)
    for field in secret_fields:
        value = out.get(field)
        if isinstance(value, str) and value:
            try:
                out[field] = decrypt_secret(value)
            except Exception as e:
                logger.error(
                    "Failed to decrypt {} for account {}: {}",
                    field,
                    account.get("id", "?"),
                    e,
                )
                out[field] = None
    return out
