"""Invite-token generation and hashing primitives.

Tokens are 32 bytes of cryptographic randomness rendered as base64url
(``secrets.token_urlsafe(32)`` → 43-char string). The raw token is sent
to the recipient via email; only the sha256 hash is persisted so a
read-only DB compromise cannot hand out usable invite grants.

Hashing uses plain sha256 with no pepper. Justification:
  * Input space is 2**256 — rainbow tables / brute-force are infeasible.
  * GitHub stores its personal-access-tokens with the same shape.
  * A pepper would buy marginal defense against an attacker who already
    has the DB AND has separately captured a candidate-token from
    elsewhere; for an admin-only invite feature with seven-day expiry
    that adversary model is not justified by a new env-var operational
    surface.

The two functions form a contract: ``generate_token()`` is the only
producer of raw tokens; ``hash_token()`` is the only producer of hash
strings. Anywhere else in the codebase that wants to compare a token
against a stored hash MUST go through ``hash_token`` so the algorithm
stays in one place.
"""
from __future__ import annotations

import hashlib
import secrets


def generate_token() -> str:
    """Return a fresh, cryptographically-random base64url token.

    32 bytes → 43-char string. Single source of truth so the migration,
    docs, and tests can all agree on the wire shape.
    """
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Return the canonical lowercase sha256 hex digest of ``token``.

    64 hex chars. Stable across processes (no pepper, no salt).
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
