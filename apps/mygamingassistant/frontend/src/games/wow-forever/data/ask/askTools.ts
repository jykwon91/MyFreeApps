/**
 * The tools the page runs for the "Ask" chat. Same names and inputs as the
 * backend's `app/services/wow/chat/chat_tool_schema.py` — change both together.
 */
export const ASK_TOOL = {
  searchNpcs: "search_npcs",
  findPlaces: "find_places",
  searchItems: "search_items",
  dungeonInfo: "dungeon_info",
  playerContext: "get_player_context",
} as const;

/** `search_npcs`'s `faction` argument. */
export const ASK_FACTION_FILTER = { alliance: "alliance", horde: "horde", any: "any" } as const;

/** The schema's limits on tool inputs (`QUERY_MAX_CHARS`, `ZONE_MAX_CHARS`, `RESULT_LIMIT_MAX`). */
export const ASK_TOOL_INPUT = {
  queryMaxChars: 80,
  zoneMaxChars: 40,
  limitMax: 10,
  defaultLimit: 5,
} as const;
