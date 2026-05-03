"""AI-powered placeholder suggestion for lease templates.

Sends extracted template text to Claude and asks it to identify and describe
each placeholder it finds. The result is a list of *proposed* placeholders
that the host reviews before committing.

Token budget:
    The raw template text is capped at ``MAX_TEMPLATE_CHARS`` (≈ 10 000 tokens
    of text). If the document is larger, only the first ``MAX_TEMPLATE_CHARS``
    characters are sent and a ``truncated`` flag is returned so the frontend
    can show a notice.

This service does NOT persist anything — callers own the lifecycle of the
suggestions. The host must explicitly save via the existing placeholder-update
endpoints.
"""
from __future__ import annotations

import json
import logging

import anthropic
from pydantic import BaseModel, ConfigDict

from app.core.config import settings

logger = logging.getLogger(__name__)

# Approximately 10 000 tokens of English prose (4 chars / token).
MAX_TEMPLATE_CHARS: int = 40_000

_SYSTEM_PROMPT = """\
You are a careful legal-document assistant. The user will give you the text of
a residential lease or rental agreement. Your job is to find every placeholder
— fields the landlord needs to fill in before sending the lease to a tenant.

Placeholders may be written as:
  • [BRACKET STYLE]
  • {{DOUBLE BRACE STYLE}}
  • ____________ (blank lines)
  • Phrases like "insert date here" or "(tenant name)"

For each placeholder you find, return a JSON object with these fields:
  • "key"         — a SHORT ALL-CAPS identifier, words separated by spaces,
                    e.g. "TENANT FULL NAME" or "MOVE-IN DATE". Use the exact
                    bracket text when it is already ALL-CAPS; otherwise derive
                    a clean key.
  • "description" — one sentence describing what this field is, in plain
                    English, suitable for a non-lawyer landlord.
  • "input_type"  — one of: "text", "date", "number", "email", "phone",
                    "signature", "computed". Choose "date" for any date field,
                    "number" for amounts and counts, "signature" for signature
                    lines, "computed" only when the value is derived from other
                    fields (e.g. total rent = daily rate × days). Use "text"
                    when nothing else fits.

Rules:
  • Deduplicate — if the same placeholder appears multiple times, include it
    only once.
  • If the document has no identifiable placeholders, return an empty list.
  • Do NOT invent placeholders that are not present in the text.
  • Return ONLY valid JSON — an array of objects, no prose, no markdown fences.

Example output:
[
  {
    "key": "TENANT FULL NAME",
    "description": "Legal full name of the tenant as it appears on their ID.",
    "input_type": "text"
  },
  {
    "key": "MOVE-IN DATE",
    "description": "The date the tenant takes possession of the unit.",
    "input_type": "date"
  }
]
"""

_ALLOWED_INPUT_TYPES: frozenset[str] = frozenset({
    "text",
    "date",
    "number",
    "email",
    "phone",
    "signature",
    "computed",
})


class SuggestedPlaceholder(BaseModel):
    """A single AI-proposed placeholder, not yet persisted."""

    key: str
    description: str
    input_type: str

    model_config = ConfigDict(extra="forbid")


class SuggestPlaceholdersResult(BaseModel):
    """Return type of ``suggest_placeholders``."""

    suggestions: list[SuggestedPlaceholder]
    truncated: bool
    chars_sent: int

    model_config = ConfigDict(extra="forbid")


def _build_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(
        api_key=settings.anthropic_api_key,
    )


def _coerce_suggestion(raw: dict) -> SuggestedPlaceholder | None:
    """Validate and normalise a single AI suggestion dict.

    Returns ``None`` if the object is malformed so we can skip bad entries
    without crashing the whole extraction.
    """
    try:
        key = str(raw.get("key", "")).strip().upper()
        if not key:
            return None
        description = str(raw.get("description", "")).strip()
        input_type = str(raw.get("input_type", "text")).strip().lower()
        if input_type not in _ALLOWED_INPUT_TYPES:
            input_type = "text"
        return SuggestedPlaceholder(
            key=key,
            description=description or f"Value for {key}",
            input_type=input_type,
        )
    except Exception:  # noqa: BLE001
        logger.warning("Skipping malformed AI suggestion: %r", raw)
        return None


async def suggest_placeholders(
    text: str,
) -> SuggestPlaceholdersResult:
    """Call Claude to suggest placeholders from ``text``.

    The caller is responsible for assembling ``text`` from the template files
    (DOCX paragraphs, markdown, plain text) before calling this function.

    Returns a :class:`SuggestPlaceholdersResult` with the proposed list and
    metadata (truncated flag, chars sent).

    Never raises on Claude API failures — logs the error and returns an empty
    suggestion list so the frontend can fall back to the regex-extracted
    placeholders gracefully.
    """
    truncated = len(text) > MAX_TEMPLATE_CHARS
    text_to_send = text[:MAX_TEMPLATE_CHARS]

    if not text_to_send.strip():
        return SuggestPlaceholdersResult(
            suggestions=[],
            truncated=False,
            chars_sent=0,
        )

    try:
        client = _build_client()
        message = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": f"Lease document text:\n\n{text_to_send}",
                }
            ],
        )
        raw_content = message.content[0].text.strip()

        # Strip markdown fences if present.
        if "```" in raw_content:
            parts = raw_content.split("```")
            for part in parts[1::2]:
                inner = part.strip()
                if inner.startswith("json"):
                    inner = inner[4:].strip()
                if inner.startswith("["):
                    raw_content = inner
                    break

        parsed = json.loads(raw_content)
        if not isinstance(parsed, list):
            logger.warning(
                "AI placeholder extraction returned non-list JSON: %r",
                type(parsed),
            )
            parsed = []

        # Deduplicate by key (preserve first occurrence).
        seen: set[str] = set()
        suggestions: list[SuggestedPlaceholder] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            suggestion = _coerce_suggestion(item)
            if suggestion is None or suggestion.key in seen:
                continue
            seen.add(suggestion.key)
            suggestions.append(suggestion)

        return SuggestPlaceholdersResult(
            suggestions=suggestions,
            truncated=truncated,
            chars_sent=len(text_to_send),
        )

    except (json.JSONDecodeError, IndexError, AttributeError) as exc:
        logger.error(
            "Failed to parse AI placeholder extraction response: %s",
            exc,
            exc_info=True,
        )
        return SuggestPlaceholdersResult(
            suggestions=[],
            truncated=truncated,
            chars_sent=len(text_to_send),
        )
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "AI placeholder extraction failed: %s",
            exc,
            exc_info=True,
        )
        return SuggestPlaceholdersResult(
            suggestions=[],
            truncated=truncated,
            chars_sent=len(text_to_send),
        )
