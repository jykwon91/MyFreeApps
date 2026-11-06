"""Text helpers for feature requests: cleaning, output filtering, fingerprints.

Pure functions. ``clean_raw_text`` is for the visitor's own words (newlines
kept); ``clean_field`` is for every short story field Claude or triage writes
(one line, capped). ``has_forbidden_markup`` is the output filter: no links,
no HTML, no markdown links, no @handles on the public board.
"""
import hashlib
import re
from typing import Any

# C0/C1 controls except \n and \t, plus zero-width and bidi-override characters.
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f​-‏‪-‮⁦-⁩﻿]")
_FORBIDDEN = re.compile(
    r"https?://|www\.|discord\.gg|<|\]\(|(?<![\w\[])@[A-Za-z0-9_]{2,}",
    re.IGNORECASE,
)
_ELLIPSIS = "…"


def clean_raw_text(value: str) -> str:
    """Strip control characters, normalise line endings and outer whitespace."""
    text = value.replace("\r\n", "\n").replace("\r", "\n")
    return _CONTROL_CHARS.sub("", text).strip()


def clean_field(value: Any, max_len: int) -> str | None:
    """One-line, control-free, capped text — or None when empty / not a string.

    Over-long text is cut at the last word that fits and ends with an ellipsis,
    so a slightly verbose sentence survives rather than being thrown away.
    """
    if not isinstance(value, str):
        return None
    text = " ".join(_CONTROL_CHARS.sub("", value).split())
    if not text:
        return None
    if len(text) <= max_len:
        return text
    cut = text[: max_len - 1].rsplit(" ", 1)[0].rstrip(" ,;:.")
    return f"{cut}{_ELLIPSIS}" if cut else text[: max_len - 1] + _ELLIPSIS


def has_forbidden_markup(text: str) -> bool:
    """True if ``text`` holds a link, HTML, a markdown link or an @handle."""
    return bool(_FORBIDDEN.search(text))


def text_fingerprint(text: str) -> str:
    """sha256 of the text, case- and whitespace-insensitive."""
    normalized = " ".join(text.lower().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()
