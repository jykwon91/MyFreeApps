"""The one Claude call per chat turn — a thin wrapper over the Anthropic SDK.

The server owns the model, max_tokens, system prompt and tools; the system
prompt + tool definitions are marked cacheable (``cache_control``: the cache
prefix is tools then system, so one breakpoint on the system block covers
both; below the model's minimum cacheable length Anthropic just doesn't cache).
``allow_tools=False`` (the last allowed round) sends ``tool_choice: none`` so
Claude has to answer in text. Failures are logged with Anthropic's documented
``error.type`` (platform_shared) — never with request content — and raised as
typed ``WowChatError``s.
"""
import logging
from typing import Any

import anthropic

from platform_shared.extraction.anthropic_errors import (
    AnthropicFailureKind,
    map_anthropic_connection_error,
    map_anthropic_status_error,
)

from app.core.config import settings
from app.core.wow_chat_limits import CHAT_MAX_RETRIES, CHAT_TIMEOUT_SECONDS, DETAIL_FAILED, DETAIL_UPSTREAM_BUSY
from app.services.wow.chat.chat_errors import ChatUpstreamBusyError, ChatUpstreamError, WowChatError
from app.services.wow.chat.chat_tool_schema import CHAT_TOOLS, SYSTEM_PROMPT

logger = logging.getLogger(__name__)

_LOG_PREFIX = "wow chat"
_CACHE_CONTROL = {"type": "ephemeral"}
_SYSTEM_BLOCKS: list[dict[str, Any]] = [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": _CACHE_CONTROL}]
_TOOL_CHOICE_AUTO = {"type": "auto"}
_TOOL_CHOICE_NONE = {"type": "none"}


def _build_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(
        api_key=settings.anthropic_api_key, max_retries=CHAT_MAX_RETRIES, timeout=CHAT_TIMEOUT_SECONDS
    )


def _map_status_error(exc: anthropic.APIStatusError) -> WowChatError:
    failure = map_anthropic_status_error(exc, log_prefix=_LOG_PREFIX, logger=logger)
    logger.info("%s: anthropic request_id=%s", _LOG_PREFIX, getattr(exc, "request_id", None))
    if failure.kind is AnthropicFailureKind.RATE_LIMITED:
        return ChatUpstreamBusyError(DETAIL_UPSTREAM_BUSY, error_type=failure.error_type)
    return ChatUpstreamError(DETAIL_FAILED, error_type=failure.error_type)


async def create_reply(messages: list[dict[str, Any]], *, allow_tools: bool) -> Any:
    """``messages.create`` with the server's fixed settings. Returns the SDK ``Message``."""
    try:
        return await _build_client().messages.create(
            model=settings.claude_wow_chat_model,
            max_tokens=settings.wow_chat_max_tokens,
            system=_SYSTEM_BLOCKS,
            tools=CHAT_TOOLS,
            tool_choice=_TOOL_CHOICE_AUTO if allow_tools else _TOOL_CHOICE_NONE,
            messages=messages,
        )
    except anthropic.APIStatusError as exc:
        raise _map_status_error(exc) from exc
    except anthropic.APIConnectionError as exc:
        # Includes APITimeoutError.
        failure = map_anthropic_connection_error(exc, log_prefix=_LOG_PREFIX, logger=logger)
        raise ChatUpstreamError(DETAIL_FAILED, error_type=failure.error_type) from exc
