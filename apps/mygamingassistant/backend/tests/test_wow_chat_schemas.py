"""Chat contract parity: Literal types == enum tuples, tool schemas == allowed tool names."""
from typing import get_args

from app.core.wow_chat_enums import ROLES, STOP_REASONS, TOOL_NAMES
from app.schemas.wow.chat.chat_literals import ChatRole, ChatStopReason, ChatToolName
from app.services.wow.chat.chat_tool_schema import CHAT_TOOLS


def test_literals_match_enum_tuples() -> None:
    assert get_args(ChatRole) == ROLES
    assert get_args(ChatToolName) == TOOL_NAMES
    assert get_args(ChatStopReason) == STOP_REASONS


def test_tool_schemas_cover_exactly_the_allowed_tools() -> None:
    assert tuple(tool["name"] for tool in CHAT_TOOLS) == TOOL_NAMES


def test_tool_inputs_are_closed() -> None:
    for tool in CHAT_TOOLS:
        assert tool["input_schema"]["additionalProperties"] is False, tool["name"]
