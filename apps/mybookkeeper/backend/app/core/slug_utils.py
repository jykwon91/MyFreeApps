"""Turn free text into a lowercase, hyphenated ASCII slug."""
from __future__ import annotations

import re
import unicodedata

_NON_ALPHANUM_RE = re.compile(r"[^a-z0-9]+")
_LEADING_TRAILING_DASH_RE = re.compile(r"^-+|-+$")


def slugify(text: str, *, max_length: int, fallback: str) -> str:
    """Strip diacritics (``María`` → ``maria``), lowercase, collapse every
    non-alphanumeric run to one ``-``, trim dashes, cap at ``max_length``.

    Text with nothing slug-able left (all emoji, punctuation) becomes ``fallback``.
    """
    decomposed = unicodedata.normalize("NFKD", text)
    ascii_only = decomposed.encode("ascii", "ignore").decode("ascii")
    hyphenated = _NON_ALPHANUM_RE.sub("-", ascii_only.lower())
    trimmed = _LEADING_TRAILING_DASH_RE.sub("", hyphenated)
    if not trimmed:
        return fallback
    return trimmed[:max_length].rstrip("-")
