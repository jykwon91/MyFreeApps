"""Public-form slug generator for listings (T0).

Slugs are URL-safe identifiers a host pastes into Airbnb / VRBO / Furnished
Finder / Rotating Room descriptions. Format::

    <ascii-lowercase-hyphenated-title>-<6-char-suffix>

The 6-char alphanumeric suffix guarantees uniqueness without a DB round-trip,
matches Furnished Finder's own URL conventions, and keeps the slug short
enough for printable QR codes.
"""
from __future__ import annotations

import re
import secrets
import string
import unicodedata

# Lowercase ASCII alphanumerics. We intentionally avoid characters humans
# easily confuse when reading aloud (``0`` vs ``O``, ``l`` vs ``1``) so the
# slug stays readable when spoken on a phone call. Six characters at 32^6
# = ~10^9 keyspace is enough that the operator's 2-room portfolio will
# never see a collision in practice.
_SUFFIX_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"
SUFFIX_LENGTH = 6
TITLE_MAX_LENGTH = 200
SLUG_MAX_LENGTH = 220  # title (200) + dash + 6-char suffix + slack

_NON_ALPHANUM_RE = re.compile(r"[^a-z0-9]+")
_LEADING_TRAILING_DASH_RE = re.compile(r"^-+|-+$")


def _slugify_title(title: str) -> str:
    """Produce the human-readable prefix of a slug.

    Strips diacritics (``María`` → ``Maria``), lowercases, replaces every
    non-alphanumeric run with a single ``-``, trims leading / trailing
    dashes, then caps to keep the final URL within HTTP path limits.
    """
    decomposed = unicodedata.normalize("NFKD", title)
    ascii_only = decomposed.encode("ascii", "ignore").decode("ascii")
    lowered = ascii_only.lower()
    hyphenated = _NON_ALPHANUM_RE.sub("-", lowered)
    trimmed = _LEADING_TRAILING_DASH_RE.sub("", hyphenated)
    if not trimmed:
        # Pathological titles (e.g. all emoji) collapse to empty after ASCII
        # encoding. Fall back to ``listing`` so the slug remains valid.
        trimmed = "listing"
    if len(trimmed) > TITLE_MAX_LENGTH:
        trimmed = trimmed[:TITLE_MAX_LENGTH].rstrip("-")
    return trimmed


def _random_suffix() -> str:
    """Cryptographically-random 6-char alphanumeric suffix."""
    return "".join(secrets.choice(_SUFFIX_ALPHABET) for _ in range(SUFFIX_LENGTH))


def generate_slug(title: str) -> str:
    """Return ``<title-prefix>-<suffix>`` for a given listing title.

    Pure function — no DB access. Callers are responsible for retrying with
    a fresh slug if the UNIQUE constraint trips (statistically rare, see
    keyspace math above; ``listing_service.create_listing`` retries up to 3
    times before surfacing the error).
    """
    return f"{_slugify_title(title)}-{_random_suffix()}"


def is_valid_suffix(suffix: str) -> bool:
    """True iff ``suffix`` matches the 6-char alphanumeric format we generate.

    Used by tests + the route to reject crafted slugs that look right but
    couldn't have been produced by ``generate_slug`` (defense in depth — the
    DB UNIQUE check is still the authoritative gate).
    """
    if len(suffix) != SUFFIX_LENGTH:
        return False
    allowed = set(_SUFFIX_ALPHABET)
    return all(c in allowed for c in suffix)


__all__ = [
    "generate_slug",
    "is_valid_suffix",
    "SUFFIX_LENGTH",
    "SLUG_MAX_LENGTH",
    "TITLE_MAX_LENGTH",
]
# ``string`` is referenced by the type checker via the alphabet construction;
# explicit re-export keeps the import non-stale even if the alphabet is later
# rebuilt from ``string.ascii_lowercase``.
_ = string