"""Keyed lookup codes ("blind indexes") for finding rows by an encrypted value.

Fernet ciphertext is randomised, so an encrypted column can't be searched for
a value. A blind index stores ``HMAC-SHA256(key, value)`` beside it: equal
values give equal codes, so a lookup is a plain equality query, and the code
shows nothing about the value to anyone without the key.

Low-entropy values (phone numbers, tax ids) CAN be recovered by anyone who
holds the key, by computing the code of every possible value. The key must be
as secret as the encryption key it is derived from
(``platform_shared.core.security.derive_key`` with its own ``info``), and
values must be normalised the same way before every call.
"""
from __future__ import annotations

import hashlib
import hmac


def blind_index(key: bytes, value: str) -> str:
    """The lowercase hex HMAC-SHA256 of ``value`` under ``key`` (64 characters)."""
    return hmac.new(key, value.encode("utf-8"), hashlib.sha256).hexdigest()
