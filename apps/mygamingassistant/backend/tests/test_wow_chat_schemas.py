"""Chat contract parity: Literal types == enum tuples, tool schemas == allowed tool names."""
import json
from typing import get_args

from app.core.wow_chat_enums import (
    CLASS_IDS,
    FARM_SORTS,
    PROFESSIONS,
    ROLES,
    STOP_REASONS,
    TOOL_AUCTION_PRICES,
    TOOL_FIND_MACROS,
    TOOL_GOLD_FARMING,
    TOOL_NAMES,
    TOOL_PROFESSION_GUIDE,
    TOOL_SERVER_STATUS,
)
from app.core.wow_prices import PRICE_REGIONS
from app.core.wow_server_status import SERVER_STATUS_REGIONS
from app.schemas.wow.chat.chat_literals import ChatRole, ChatStopReason, ChatToolName
from app.services.wow.chat.chat_tool_schema import CHAT_TOOLS, SYSTEM_PROMPT

# Tool definitions go out (prompt-cached) on every turn; growing them costs every question.
TOOLS_JSON_MAX_CHARS = 7_600
TOOL_DESCRIPTION_MAX_CHARS = 500


def test_literals_match_enum_tuples() -> None:
    assert get_args(ChatRole) == ROLES
    assert get_args(ChatToolName) == TOOL_NAMES
    assert get_args(ChatStopReason) == STOP_REASONS


def test_tool_schemas_cover_exactly_the_allowed_tools() -> None:
    assert tuple(tool["name"] for tool in CHAT_TOOLS) == TOOL_NAMES


def test_tool_inputs_are_closed() -> None:
    for tool in CHAT_TOOLS:
        assert tool["input_schema"]["additionalProperties"] is False, tool["name"]


def test_prompt_never_lets_claude_guess_a_price_or_the_server_status() -> None:
    assert "never guess a price" in SYSTEM_PROMPT
    assert "never say the servers are up or down" in SYSTEM_PROMPT


def test_prompt_ties_travel_claims_to_the_tool_route() -> None:
    assert '"route" a search_npcs result' in SYSTEM_PROMPT
    assert "Never mention a boat, zeppelin" in SYSTEM_PROMPT


def test_tool_definitions_stay_lean() -> None:
    assert len(json.dumps(CHAT_TOOLS)) <= TOOLS_JSON_MAX_CHARS
    for tool in CHAT_TOOLS:
        assert len(tool["description"]) <= TOOL_DESCRIPTION_MAX_CHARS, tool["name"]


def test_enum_inputs_list_the_shared_values() -> None:
    by_name = {tool["name"]: tool["input_schema"]["properties"] for tool in CHAT_TOOLS}
    assert tuple(by_name[TOOL_PROFESSION_GUIDE]["profession"]["enum"]) == PROFESSIONS
    assert tuple(by_name[TOOL_FIND_MACROS]["class"]["enum"]) == CLASS_IDS
    assert tuple(by_name[TOOL_AUCTION_PRICES]["region"]["enum"]) == PRICE_REGIONS
    assert tuple(by_name[TOOL_SERVER_STATUS]["region"]["enum"]) == SERVER_STATUS_REGIONS
    assert tuple(by_name[TOOL_GOLD_FARMING]["sort"]["enum"]) == FARM_SORTS
