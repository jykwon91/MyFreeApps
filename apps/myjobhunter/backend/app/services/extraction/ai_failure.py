"""Route a failed Claude call on the shared failure kind.

``claude_service`` raises ``platform_shared.extraction.ExtractionError`` for
every Anthropic failure; its ``kind`` decides the copy the user sees (and,
via ``platform_shared.extraction.is_transient_failure``, retry-later vs
final). Workers and routes call these instead of writing their own
``isinstance`` checks against the SDK.
"""
from __future__ import annotations

from platform_shared.extraction import AnthropicFailureKind, ExtractionError

from app.core.ai_failure_messages import (
    AI_BUSY_MESSAGE,
    AI_INPUT_REJECTED_MESSAGE,
    AI_UNAVAILABLE_MESSAGE,
    AI_UNREADABLE_REPLY_MESSAGE,
)


def user_failure_message(exc: BaseException, *, fallback: str) -> str:
    """User copy for a failed AI-backed job: our Claude copy for a Claude
    failure or an unreadable reply (``ValueError``), ``fallback`` for any
    other error — never the exception's own text."""
    if isinstance(exc, ExtractionError):
        return ai_failure_message(exc.kind)
    if isinstance(exc, ValueError):
        return ai_failure_message(None)
    return fallback


def ai_failure_message(kind: AnthropicFailureKind | None) -> str:
    """User copy for a Claude failure; ``None`` means the reply was unreadable."""
    if kind is None:
        return AI_UNREADABLE_REPLY_MESSAGE
    if kind.is_transient:
        return AI_BUSY_MESSAGE
    if kind is AnthropicFailureKind.INPUT_REJECTED:
        return AI_INPUT_REJECTED_MESSAGE
    return AI_UNAVAILABLE_MESSAGE
