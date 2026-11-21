"""The HTTP answer for a Claude failure, shared by every AI-backed route.

Status stays 502 (the clients already route on it), the detail is our own
copy for the failure kind, and a failure that clears on its own carries
``Retry-After`` so it doesn't read as permanent.
"""
from __future__ import annotations

from fastapi import HTTPException
from platform_shared.extraction import AnthropicFailureKind

from app.core.ai_failure_messages import AI_RETRY_AFTER_SECONDS
from app.services.extraction.ai_failure import ai_failure_message

_AI_FAILURE_STATUS = 502


def ai_failure_http_exception(kind: AnthropicFailureKind | None) -> HTTPException:
    """``kind`` is the shared failure kind; ``None`` means Claude's reply was unreadable."""
    headers = (
        {"Retry-After": str(AI_RETRY_AFTER_SECONDS)}
        if kind is not None and kind.is_transient
        else None
    )
    return HTTPException(
        status_code=_AI_FAILURE_STATUS,
        detail=ai_failure_message(kind),
        headers=headers,
    )
