"""Anthropic ``Message`` -> the assistant message the relay returns.

Claude's output is untrusted. Only non-empty text blocks and ``tool_use``
blocks for the fixed tools (valid id, object input of bounded size) pass;
everything else (thinking, server tools, unknown tools) is dropped and
counted. Tool calls only pass when the reply actually stopped to use them and
this round allows tools — otherwise the browser would owe results for calls it
can't send back. A reply with nothing left is a failure, not an empty answer.
"""
import json
import re
from typing import Any

from app.core.wow_chat_enums import (
    BLOCK_TEXT,
    BLOCK_TOOL_USE,
    ROLE_ASSISTANT,
    STOP_END_TURN,
    STOP_MAX_TOKENS,
    STOP_REFUSAL,
    STOP_TOOL_USE,
    TOOL_NAMES,
)
from app.core.wow_chat_limits import DETAIL_FAILED, TOOL_INPUT_MAX_CHARS, TOOL_USE_ID_PATTERN
from app.schemas.wow.chat.chat_message import ChatMessage
from app.schemas.wow.chat.chat_text_block import ChatTextBlock
from app.schemas.wow.chat.chat_tool_use_block import ChatToolUseBlock
from app.services.wow.chat.chat_errors import ChatUpstreamError
from app.services.wow.chat.mapped_reply import MappedReply
from app.services.wow.chat.reply_usage import ReplyUsage

_TOOL_USE_ID = re.compile(TOOL_USE_ID_PATTERN)
_PASSED_ON_STOP_REASONS = frozenset({STOP_MAX_TOKENS, STOP_REFUSAL})


def _count(usage: Any, name: str) -> int:
    value = getattr(usage, name, None)
    return value if isinstance(value, int) and value > 0 else 0


def map_usage(response: Any) -> ReplyUsage:
    usage = getattr(response, "usage", None)
    return ReplyUsage(
        input_tokens=_count(usage, "input_tokens"),
        output_tokens=_count(usage, "output_tokens"),
        cache_creation_input_tokens=_count(usage, "cache_creation_input_tokens"),
        cache_read_input_tokens=_count(usage, "cache_read_input_tokens"),
    )


def _tool_use(block: Any) -> ChatToolUseBlock | None:
    name, block_id, tool_input = (getattr(block, k, None) for k in ("name", "id", "input"))
    if name not in TOOL_NAMES or not isinstance(block_id, str) or not _TOOL_USE_ID.fullmatch(block_id):
        return None
    if not isinstance(tool_input, dict):
        return None
    try:
        if len(json.dumps(tool_input, separators=(",", ":"))) > TOOL_INPUT_MAX_CHARS:
            return None
        return ChatToolUseBlock(type=BLOCK_TOOL_USE, id=block_id, name=name, input=tool_input)
    except (TypeError, ValueError):
        return None


def map_reply(response: Any, *, allow_tools: bool) -> MappedReply:
    raw_stop = getattr(response, "stop_reason", None)
    keep_tools = allow_tools and raw_stop == STOP_TOOL_USE
    content: list[ChatTextBlock | ChatToolUseBlock] = []
    dropped = 0
    for block in getattr(response, "content", None) or []:
        block_type = getattr(block, "type", None)
        text = getattr(block, "text", None)
        if block_type == BLOCK_TEXT and isinstance(text, str) and text.strip():
            content.append(ChatTextBlock(type=BLOCK_TEXT, text=text))
            continue
        tool_use = _tool_use(block) if block_type == BLOCK_TOOL_USE and keep_tools else None
        if tool_use is None:
            dropped += 1
            continue
        content.append(tool_use)
    if not content:
        raise ChatUpstreamError(DETAIL_FAILED, error_type="empty_reply")
    stop_reason = STOP_END_TURN
    if any(isinstance(block, ChatToolUseBlock) for block in content):
        stop_reason = STOP_TOOL_USE
    elif raw_stop in _PASSED_ON_STOP_REASONS:
        stop_reason = str(raw_stop)
    return MappedReply(
        message=ChatMessage(role=ROLE_ASSISTANT, content=content),
        stop_reason=stop_reason,
        usage=map_usage(response),
        dropped_blocks=dropped,
    )
