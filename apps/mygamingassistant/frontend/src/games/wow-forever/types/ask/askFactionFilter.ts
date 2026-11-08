import type { ASK_FACTION_FILTER } from "@/games/wow-forever/data/ask/askTools";

/** `search_npcs`'s `faction` argument. */
export type AskFactionFilter = (typeof ASK_FACTION_FILTER)[keyof typeof ASK_FACTION_FILTER];
