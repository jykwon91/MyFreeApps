"""Shared helpers for the WoW "Ask" chat relay tests (not a test module).

Claude is a fake async client patched over ``chat_client._build_client``; it
returns canned SDK-shaped replies (SimpleNamespace blocks + usage) or raises.
"""
from __future__ import annotations

from collections.abc import Callable
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import anthropic
import httpx2

from app.api.wow_chat import continuation_limiter, turn_daily_limiter, turn_hourly_limiter

BUILD_CLIENT = "app.services.wow.chat.chat_client._build_client"
VERIFY_TURNSTILE = "app.core.rate_limit.verify_turnstile_token"
URL = "/api/wow/chat/turn"
QUESTION = "where's the closest warlock trainer if i'm in desolace"

ALL_LIMITERS = (turn_hourly_limiter, turn_daily_limiter, continuation_limiter)


def reset_limiters() -> None:
    for limiter in ALL_LIMITERS:
        limiter._buckets.clear()


def user_text(text: str = QUESTION) -> dict[str, Any]:
    return {"role": "user", "content": [{"type": "text", "text": text}]}


def tool_results(*ids: str, content: str = '{"results":[]}') -> dict[str, Any]:
    return {
        "role": "user",
        "content": [{"type": "tool_result", "tool_use_id": i, "content": content, "is_error": False} for i in ids],
    }


def usage(input_tokens: int = 1200, output_tokens: int = 80, cache_read: int = 0) -> SimpleNamespace:
    return SimpleNamespace(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_creation_input_tokens=0,
        cache_read_input_tokens=cache_read,
    )


def text_block(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def tool_block(tool_id: str = "toolu_01", name: str = "search_npcs", tool_input: dict[str, Any] | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        type="tool_use",
        id=tool_id,
        name=name,
        input=tool_input if tool_input is not None else {"query": "warlock trainer", "from_zone": "Desolace"},
    )


def reply(*blocks: SimpleNamespace, stop_reason: str = "end_turn", reply_usage: SimpleNamespace | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        content=list(blocks),
        stop_reason=stop_reason,
        usage=reply_usage or usage(),
        model="claude-haiku-test",
    )


def tool_reply(*ids: str) -> SimpleNamespace:
    return reply(text_block("Looking that up."), *(tool_block(i) for i in ids or ("toolu_01",)), stop_reason="tool_use")


def fake_client(
    *replies: SimpleNamespace,
    error: Exception | None = None,
    side_effect: Callable[..., Any] | None = None,
) -> Any:
    create = AsyncMock()
    if side_effect is not None:
        create.side_effect = side_effect
    elif error is not None:
        create.side_effect = error
    elif len(replies) > 1:
        create.side_effect = list(replies)
    else:
        create.return_value = replies[0] if replies else reply(text_block("Here are the nearest ones."))
    return SimpleNamespace(messages=SimpleNamespace(create=create))


def status_error(cls: type[anthropic.APIStatusError], status: int, error_type: str) -> Exception:
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx2.Response(status, request=request)
    body = {"type": "error", "error": {"type": error_type, "message": "boom"}}
    return cls("boom", response=response, body=body)
