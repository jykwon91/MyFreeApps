/** The dungeon index; each dungeon's page is under it. */
export const DUNGEONS_PAGE_PATH = "/wow-forever/dungeons";

/** Rows the index skeleton draws while the data loads (the Classic dungeons Forever has: 19). */
export const DUNGEON_LIST_SKELETON_ROWS = 19;

/** Boss sections, and loot rows in each, the dungeon page's skeleton draws. */
export const DUNGEON_SKELETON_BOSSES = 3;
export const DUNGEON_SKELETON_LOOT_ROWS = 2;

/** What a boss's Drops shows when there's nothing to list, and a dungeon with no boss list. */
export const DUNGEON_LOOT_EMPTY = {
  noList: "No loot list for this boss yet.",
  notInForever: "None of this boss's Classic loot is in the Forever game files yet.",
  noBosses: "The boss list for this dungeon isn't in our data yet.",
} as const;
