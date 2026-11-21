"""The HTTP answer when the tax advisor's Claude call fails, routed on the shared failure kind."""
from __future__ import annotations

from fastapi import HTTPException
from platform_shared.extraction import AnthropicFailureKind

from app.core.tax_advisor_failure_messages import (
    TAX_ADVISOR_AI_FAILURE_STATUS,
    TAX_ADVISOR_BUSY_MESSAGE,
    TAX_ADVISOR_INPUT_REJECTED_MESSAGE,
    TAX_ADVISOR_RETRY_AFTER_SECONDS,
    TAX_ADVISOR_UNAVAILABLE_MESSAGE,
)


def tax_advisor_failure_http(kind: AnthropicFailureKind | None) -> HTTPException:
    """Our copy for the kind (``None``: unclassified, treated as unavailable);
    only a failure that clears on its own carries ``Retry-After``."""
    if kind is not None and kind.is_transient:
        return HTTPException(
            status_code=TAX_ADVISOR_AI_FAILURE_STATUS,
            detail=TAX_ADVISOR_BUSY_MESSAGE,
            headers={"Retry-After": str(TAX_ADVISOR_RETRY_AFTER_SECONDS)},
        )
    detail = (
        TAX_ADVISOR_INPUT_REJECTED_MESSAGE
        if kind is AnthropicFailureKind.INPUT_REJECTED
        else TAX_ADVISOR_UNAVAILABLE_MESSAGE
    )
    return HTTPException(status_code=TAX_ADVISOR_AI_FAILURE_STATUS, detail=detail)
