"""Read who sent an incoming payment from its bank description. Pure.

Bank sync (Plaid) gives no payer field, only the bank's description of the
row, so rent attribution reads the sender's name out of it. Returns ``None``
for anything that isn't a recognised person-to-person shape: a row with no
payer is left alone rather than queued for review under a made-up name.
"""
from __future__ import annotations

from app.core.bank_payer_name_constants import (
    BRACKETED_NAME_MAX_WORDS,
    BRACKETED_NAME_MIN_WORDS,
    NAME_TERMINATOR_PATTERN,
    NAME_THEN_BRACKETS_PATTERN,
    NAME_WORD_PATTERN,
    NON_NAME_WORDS,
    PAYER_NAME_MAX_LENGTH,
    ZELLE_FROM_PATTERN,
)


def parse_payer_name(description: str | None) -> str | None:
    if not description:
        return None
    zelle = ZELLE_FROM_PATTERN.match(description)
    if zelle:
        return _sender_name(zelle.group("name"))
    bracketed = NAME_THEN_BRACKETS_PATTERN.match(description)
    if bracketed:
        return _bracketed_name(bracketed.group("name"))
    return None


def _sender_name(raw: str) -> str | None:
    """The name up to the first memo or reference marker, without the
    reference tokens a bank appends (anything holding a digit)."""
    words = NAME_TERMINATOR_PATTERN.split(raw, maxsplit=1)[0].split()
    while words and any(ch.isdigit() for ch in words[-1]):
        words.pop()
    if not words or not all(NAME_WORD_PATTERN.match(w) for w in words):
        return None
    return _display(words)


def _bracketed_name(raw: str) -> str | None:
    words = raw.split()
    if not BRACKETED_NAME_MIN_WORDS <= len(words) <= BRACKETED_NAME_MAX_WORDS:
        return None
    if not all(NAME_WORD_PATTERN.match(w) for w in words):
        return None
    if any(w.lower().rstrip(".") in NON_NAME_WORDS for w in words):
        return None
    return _display(words)


def _display(words: list[str]) -> str:
    """Bank exports shout names (``SONU KING``); show them as names. Mixed
    case is kept as the bank wrote it (``McDonald``). Matching ignores case."""
    name = " ".join(w.capitalize() if w.isupper() or w.islower() else w for w in words)
    return name[:PAYER_NAME_MAX_LENGTH]
