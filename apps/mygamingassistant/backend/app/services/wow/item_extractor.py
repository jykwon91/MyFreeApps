"""Read one WoW item tooltip (screenshot or pasted text) into structured stats.

Nothing about the item is stored. The only write is one increment of the
durable global daily cap (``daily_usage_counters``, platform_shared), made in
its own short transaction AFTER input validation (so bad input never burns
quota) and BEFORE the Claude call (so no DB connection is held for the call).
Claude is called with a single forced tool call
(``record_item``); the tool input is validated by ``item_response_mapper``.

Anthropic failures are logged with their documented ``error.type`` and raised
as typed ``ItemExtractionError`` subclasses so the route can answer with a
specific status (rate limit vs misconfiguration vs upstream outage).
"""
from __future__ import annotations

import base64
import logging
from typing import Any

import anthropic

from platform_shared.repositories.daily_quota_repo import try_consume_daily_quota

from app.core.config import settings
from app.db.session import unit_of_work
from app.schemas.wow.extracted_item import ItemExtractionResponse
from app.services.wow.image_validation import detect_image_media_type
from app.services.wow.item_extraction_errors import (
    ItemExtractionDailyCapError,
    ItemExtractionInputError,
    ItemExtractionMisconfiguredError,
    ItemExtractionNotConfiguredError,
    ItemExtractionRateLimitedError,
    ItemExtractionTooLargeError,
    ItemExtractionUnreadableError,
    ItemExtractionUpstreamError,
)
from app.services.wow.item_response_mapper import map_tool_input
from app.services.wow.item_tool_schema import ITEM_TOOL, SYSTEM_PROMPT, TOOL_NAME

logger = logging.getLogger(__name__)

_MAX_TOKENS = 1500
_TIMEOUT_SECONDS = 60.0
DAILY_CAP_BUCKET = "wow-item-extract"


def _build_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(
        api_key=settings.anthropic_api_key, max_retries=1, timeout=_TIMEOUT_SECONDS
    )


def _validate_input(image: bytes | None, text: str | None) -> list[dict[str, Any]]:
    """Return the user-message content blocks, or raise on unusable input."""
    has_text = bool(text and text.strip())
    if image is not None and has_text:
        raise ItemExtractionInputError("Send a screenshot or tooltip text, not both.")
    if image is not None:
        if len(image) > settings.item_extract_max_image_bytes:
            raise ItemExtractionTooLargeError("Image is over the size limit.")
        media_type = detect_image_media_type(image)
        if media_type is None:
            raise ItemExtractionInputError("Only PNG, JPEG or WebP screenshots are supported.")
        return [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": base64.standard_b64encode(image).decode(),
                },
            },
            {"type": "text", "text": "Record this item tooltip."},
        ]
    if has_text:
        assert text is not None
        if len(text) > settings.item_extract_max_text_chars:
            raise ItemExtractionInputError("Tooltip text is too long.")
        return [{"type": "text", "text": f"Record this item tooltip:\n\n{text.strip()}"}]
    raise ItemExtractionInputError("Add a screenshot or paste the tooltip text.")


async def extract_item(
    *, image: bytes | None = None, text: str | None = None
) -> ItemExtractionResponse:
    """Extract one item. Raises an ``ItemExtractionError`` subclass on failure."""
    if not settings.anthropic_api_key:
        raise ItemExtractionNotConfiguredError(
            "ANTHROPIC_API_KEY is not set", error_type="missing_api_key"
        )
    content = _validate_input(image, text)
    await _consume_daily_quota()

    try:
        response = await _build_client().messages.create(
            model=settings.claude_item_extractor_model,
            max_tokens=_MAX_TOKENS,
            system=SYSTEM_PROMPT,
            tools=[ITEM_TOOL],
            tool_choice={"type": "tool", "name": TOOL_NAME},
            messages=[{"role": "user", "content": content}],
        )
    except anthropic.APIStatusError as exc:
        raise _map_status_error(exc) from exc
    except anthropic.APIConnectionError as exc:
        # Includes APITimeoutError.
        logger.warning("wow item extract: connection error: %s", type(exc).__name__)
        raise ItemExtractionUpstreamError(
            "Could not reach the AI service", error_type="connection_error"
        ) from exc

    tool_input = next(
        (
            block.input
            for block in response.content
            if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == TOOL_NAME
        ),
        None,
    )
    if not isinstance(tool_input, dict):
        logger.warning(
            "wow item extract: no %s tool call in response (stop_reason=%s)",
            TOOL_NAME,
            getattr(response, "stop_reason", None),
        )
        raise ItemExtractionUnreadableError("The AI returned no item", error_type="no_tool_call")
    return map_tool_input(tool_input)


async def _consume_daily_quota() -> None:
    """Take one unit of today's global cap, or raise ``ItemExtractionDailyCapError``."""
    cap = settings.wow_extract_daily_cap
    async with unit_of_work() as db:
        consumed = await try_consume_daily_quota(db, bucket=DAILY_CAP_BUCKET, cap=cap)
    if not consumed:
        logger.warning("wow item extract: daily cap reached (cap=%d)", cap)
        raise ItemExtractionDailyCapError(
            "Daily item-reader cap reached", error_type="daily_cap_reached"
        )


def _map_status_error(exc: anthropic.APIStatusError) -> Exception:
    """Log Anthropic's documented error.type and pick the matching failure class."""
    error_type = exc.type or f"http_{exc.status_code}"
    if isinstance(exc, anthropic.RateLimitError):
        logger.warning("wow item extract: rate limited: error_type=%s", error_type)
        return ItemExtractionRateLimitedError(str(exc), error_type=error_type)
    if isinstance(exc, (anthropic.AuthenticationError, anthropic.PermissionDeniedError)):
        logger.error(
            "wow item extract: credentials rejected: error_type=%s status=%s",
            error_type,
            exc.status_code,
        )
        return ItemExtractionMisconfiguredError(str(exc), error_type=error_type)
    if exc.status_code in (400, 413, 422):
        logger.warning(
            "wow item extract: input rejected: error_type=%s status=%s", error_type, exc.status_code
        )
        return ItemExtractionUnreadableError(str(exc), error_type=error_type)
    logger.error(
        "wow item extract: upstream error: error_type=%s status=%s", error_type, exc.status_code
    )
    return ItemExtractionUpstreamError(str(exc), error_type=error_type)
