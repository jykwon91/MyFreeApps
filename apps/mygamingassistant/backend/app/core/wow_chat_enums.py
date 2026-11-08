"""Allowed values for the WoW Forever "Ask" chat relay — one list per enum.

The schema ``Literal`` types (``app/schemas/wow/chat/chat_literals.py``) spell
the same values out for type checkers; ``tests/test_wow_chat_schemas.py`` pins
them against these tuples. The frontend's tool runner keeps the same tool
names — change both sides together.
"""

# --- Message roles ------------------------------------------------------------
ROLE_USER = "user"
ROLE_ASSISTANT = "assistant"
ROLES: tuple[str, ...] = (ROLE_USER, ROLE_ASSISTANT)

# --- Content block types (the only ones the relay accepts or returns) -----------
BLOCK_TEXT = "text"
BLOCK_TOOL_USE = "tool_use"
BLOCK_TOOL_RESULT = "tool_result"
BLOCK_TYPES: tuple[str, ...] = (BLOCK_TEXT, BLOCK_TOOL_USE, BLOCK_TOOL_RESULT)

# --- Tools the browser runs against its bundled game data ------------------------
TOOL_SEARCH_NPCS = "search_npcs"
TOOL_FIND_PLACES = "find_places"
TOOL_SEARCH_ITEMS = "search_items"
TOOL_DUNGEON_INFO = "dungeon_info"
TOOL_GET_PLAYER_CONTEXT = "get_player_context"
TOOL_FIND_RARES = "find_rares"
TOOL_PROFESSION_GUIDE = "profession_guide"
TOOL_GOLD_FARMING = "gold_farming"
TOOL_FIND_MACROS = "find_macros"
TOOL_AUCTION_PRICES = "auction_prices"
TOOL_SERVER_STATUS = "server_status"
TOOL_NAMES: tuple[str, ...] = (
    TOOL_SEARCH_NPCS,
    TOOL_FIND_PLACES,
    TOOL_SEARCH_ITEMS,
    TOOL_DUNGEON_INFO,
    TOOL_GET_PLAYER_CONTEXT,
    TOOL_FIND_RARES,
    TOOL_PROFESSION_GUIDE,
    TOOL_GOLD_FARMING,
    TOOL_FIND_MACROS,
    TOOL_AUCTION_PRICES,
    TOOL_SERVER_STATUS,
)

# --- search_npcs faction filter ----------------------------------------------------
FACTION_ALLIANCE = "alliance"
FACTION_HORDE = "horde"
FACTION_ANY = "any"
FACTION_FILTERS: tuple[str, ...] = (FACTION_ALLIANCE, FACTION_HORDE, FACTION_ANY)

# --- profession_guide: every guide on the Professions page (its ``?p=`` keys) -------
PROFESSIONS: tuple[str, ...] = (
    "alchemy",
    "blacksmithing",
    "enchanting",
    "engineering",
    "leatherworking",
    "tailoring",
    "herbalism",
    "mining",
    "skinning",
    "cooking",
    "firstaid",
    "fishing",
)

# --- find_macros: the class ids the site uses (``data/classes.ts``) -----------------
CLASS_IDS: tuple[str, ...] = (
    "druid",
    "hunter",
    "mage",
    "paladin",
    "priest",
    "rogue",
    "shaman",
    "warlock",
    "warrior",
)

# --- gold_farming: how farm spots are ranked (``gold/goldFarms.ts`` FARM_SORT) -------
FARM_SORTS: tuple[str, ...] = ("gold", "cloth")

# --- Why the reply stopped (Anthropic's values the relay passes on) ---------------
STOP_END_TURN = "end_turn"
STOP_TOOL_USE = "tool_use"
STOP_MAX_TOKENS = "max_tokens"
STOP_REFUSAL = "refusal"
STOP_REASONS: tuple[str, ...] = (STOP_END_TURN, STOP_TOOL_USE, STOP_MAX_TOKENS, STOP_REFUSAL)

# --- What kind of call a request is ----------------------------------------------
TURN_NEW_MESSAGE = "new_message"
TURN_CONTINUATION = "continuation"
