"""Literal types for the chat schemas.

``Literal[...]`` needs the values spelled out for type checkers;
``tests/test_wow_chat_schemas.py`` checks each against its tuple in
``app/core/wow_chat_enums.py`` so they never drift.
"""
from typing import Literal

ChatRole = Literal["user", "assistant"]
ChatToolName = Literal[
    "search_npcs",
    "find_places",
    "search_items",
    "dungeon_info",
    "get_player_context",
    "find_rares",
    "profession_guide",
    "gold_farming",
    "find_macros",
    "auction_prices",
    "server_status",
]
ChatStopReason = Literal["end_turn", "tool_use", "max_tokens", "refusal"]
