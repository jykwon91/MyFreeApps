"""Find the JSON payload inside a model's text response.

Moved verbatim out of ``platform_shared.extraction.service`` so the web
research service can reuse it without importing a private name across
modules. Behaviour is unchanged — ``ExtractionService`` calls straight
through to :func:`find_json`.
"""
from __future__ import annotations

import json
from typing import Any

__all__ = ["find_json"]

# Distinguishes "decoded the JSON value ``null``" from "decoded nothing".
_NOTHING = object()


def find_json(content: str) -> Any:
    """The first JSON value in the response, wherever it starts.

    A fenced block wins when there is one — the model was explicit about
    which part of its answer is the payload. Failing that, the text is
    scanned for a value rather than decoded from character zero.

    That scan is the whole point. Asked to reconcile a declarations page
    whose premiums did not add up, the model wrote out its arithmetic and
    then answered, and the object it produced was discarded because prose
    stood in front of it — a correct extraction, from a call that
    succeeded and was paid for, thrown away over its position in the
    string. ``raw_decode`` reads one value and stops, so trailing
    commentary is tolerated for the same reason.

    Candidates are tried left to right and the first that decodes wins. A
    brace inside prose that starts no valid value simply fails and the scan
    moves on. First rather than last, because every nested object inside
    the payload is also a candidate: taking the last decodable value would
    return an inner fragment of the very object being looked for.
    """
    stripped = content.strip()

    fenced = _fenced_candidates(stripped)
    for candidate in fenced:
        value = _decode_prefix(candidate)
        if value is not _NOTHING:
            return value

    for start in _value_starts(stripped):
        value = _decode_prefix(stripped[start:])
        if value is not _NOTHING:
            return value

    # Nothing decoded. Re-raise from the whole response so the error the
    # caller logs points at what the model actually said.
    return json.loads(stripped)


def _fenced_candidates(content: str) -> list[str]:
    """Bodies of any ``` fences, language tag removed."""
    if "```" not in content:
        return []
    candidates = []
    for part in content.split("```")[1::2]:  # odd-indexed parts are inside fences
        inner = part.strip()
        if inner.startswith("json"):
            inner = inner[4:].strip()
        candidates.append(inner)
    return candidates


def _value_starts(content: str) -> list[int]:
    """Indexes where a JSON object or array could begin."""
    return [i for i, ch in enumerate(content) if ch in "{["]


def _decode_prefix(candidate: str) -> Any:
    """One JSON value off the front of ``candidate``, or ``_NOTHING``."""
    try:
        value, _ = json.JSONDecoder().raw_decode(candidate.lstrip())
    except json.JSONDecodeError:
        return _NOTHING
    return value
