"""Extract bracketed placeholders from template source text.

The regex matches ``[A-Z][A-Z0-9 _-]+`` inside square brackets so that
``[TENANT FULL NAME]``, ``[MOVE-IN DATE]``, and ``[NUMBER OF DAYS]`` are all
captured but free-text usage of brackets like ``[Note: see addendum]`` is
not (the leading character must be uppercase A-Z).

The returned key set is normalised: keys are stripped, internal whitespace
runs are collapsed to a single space, and order of first appearance is
preserved across all input strings.
"""
from __future__ import annotations

import re

PLACEHOLDER_RE = re.compile(r"\[([A-Z][A-Z0-9 _\-]*?)\]")


def normalise_key(key: str) -> str:
    """Collapse internal whitespace runs to single spaces; strip ends."""
    return re.sub(r"\s+", " ", key.strip())


def extract_placeholder_keys(text: str) -> list[str]:
    """Return placeholder keys discovered in ``text`` in first-appearance order."""
    seen: set[str] = set()
    out: list[str] = []
    for match in PLACEHOLDER_RE.finditer(text):
        key = normalise_key(match.group(1))
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def extract_placeholders_across_files(texts: list[str]) -> list[str]:
    """Dedupe placeholders across N files, preserving first-appearance order."""
    seen: set[str] = set()
    out: list[str] = []
    for text in texts:
        for key in extract_placeholder_keys(text):
            if key in seen:
                continue
            seen.add(key)
            out.append(key)
    return out
