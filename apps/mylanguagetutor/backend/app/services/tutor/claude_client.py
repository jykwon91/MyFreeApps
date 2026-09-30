"""The Anthropic client the tutor uses.

One process-wide ``AsyncAnthropic`` (connection pooling across turns).
``max_retries=1``: the SDK retries a connection error / 429 / 5xx once
BEFORE any token streams; beyond that a live conversation is better served
by a fast "try again" than by a long backoff. (That's also why the tutor does
not use ``platform_shared.extraction.backoff.create_with_backoff`` -- its
60 s+ waits suit batch extraction, not a learner waiting mid-sentence.)

Tests patch ``get_client``.
"""
from __future__ import annotations

import anthropic

from app.core.config import settings

_TIMEOUT_SECONDS = 45.0
_MAX_RETRIES = 1

_client: anthropic.AsyncAnthropic | None = None


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            max_retries=_MAX_RETRIES,
            timeout=_TIMEOUT_SECONDS,
        )
    return _client
