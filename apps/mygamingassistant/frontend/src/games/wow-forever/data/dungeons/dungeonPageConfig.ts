/** The dungeon index; each dungeon's page is under it. */
export const DUNGEONS_PAGE_PATH = "/wow-forever/dungeons";

/** Rows the index skeleton draws while the data loads (19 Classic dungeons Forever has + 9 it added). */
export const DUNGEON_LIST_SKELETON_ROWS = 28;

/** Boss sections, and loot rows in each, the dungeon page's skeleton draws. */
export const DUNGEON_SKELETON_BOSSES = 3;
export const DUNGEON_SKELETON_LOOT_ROWS = 2;
/** Fact rows in the skeleton's "When you can go" section (level, lowest level, group size, key). */
export const DUNGEON_SKELETON_FACTS = 4;

/** What a boss's Drops shows when there's nothing to list, and a dungeon with no boss list. */
export const DUNGEON_LOOT_EMPTY = {
  noList: "No loot list for this boss yet.",
  notInForever: "None of this boss's Classic loot is in the Forever game files yet.",
  noBosses: "The boss list for this dungeon isn't in our data yet.",
} as const;

/** What a new Forever dungeon's page says where the client gives us nothing. */
export const FOREVER_DUNGEON_COPY = {
  tag: "New in Forever",
  notKnown: "Not known yet",
  areaOnly: "The game lists it in this area. The exact door isn't known yet.",
  noPlace: "We don't know where the entrance is yet.",
  loot: "What the bosses drop isn't known yet for Forever's new dungeons.",
  legend: "Where Forever's new dungeons are",
  entranceLink: "Show entrance on the World Map",
  areaLink: (zoneName: string) => `Show ${zoneName} on the World Map`,
} as const;

/**
 * What the Ask chat's `dungeon_info` tells the model it doesn't know about a
 * dungeon Forever added, so a missing fact never reads as "there's no rule".
 */
export const FOREVER_DUNGEON_UNKNOWN = {
  value: "not known yet",
  facts: ["lowest_level_to_enter", "entrance_door", "keys_or_attunement", "boss_loot", "quests"],
} as const;

/** Quest rows the dungeon page's skeleton draws in its Quests section. */
export const DUNGEON_SKELETON_QUESTS = 4;

/** What the Quests section shows when there's nothing to list. */
export const DUNGEON_QUESTS_EMPTY = {
  none: "No quests for this dungeon in our data yet.",
  noneForFaction: "No quests for this dungeon for your faction in our data yet.",
} as const;

/** An opened quest's "Quest chain" lists this many of the quests after it, then says how many more. */
export const QUEST_CHAIN_AFTER_SHOWN = 3;

/** Whether a quest can be shared: the row's badge, and the sentence an opened quest gives. */
export const QUEST_SHARING_COPY = {
  shareable: { badge: "Shareable", detail: "Share it from your quest log with party members who meet its level and have done the quests before it." },
  notShareable: { badge: "Can't share", detail: "Everyone in your group has to get it themselves, from its quest giver or the item that starts it." },
} as const;

/** How far the World Map zooms in on a quest giver its link marks (1 = the whole zone). */
export const QUEST_GIVER_MAP_SCALE = 2;
/** The id of the one mark a quest giver's World Map link carries. */
export const QUEST_GIVER_MARK_ID = "quest-giver";
