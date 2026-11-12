/** The guild page: /wow-forever/guild/:slug. */
export const GUILD_PAGE_PATH = "/wow-forever/guild";

/** The member list's sort columns. */
export const GUILD_SORT_KEYS = {
  rank: "rank",
  name: "name",
  level: "level",
  className: "class",
  itemLevel: "ilvl",
} as const;
export type GuildSortKey = (typeof GUILD_SORT_KEYS)[keyof typeof GUILD_SORT_KEYS];

export const GUILD_SORT_LABELS: Readonly<Record<GuildSortKey, string>> = {
  rank: "Rank",
  name: "Name",
  level: "Level",
  class: "Class",
  ilvl: "Item level",
};

/** Sorts that read best highest-first by default (rank reads lowest-first: 0 is the guild master). */
export const GUILD_SORT_DESCENDING_FIRST: ReadonlySet<GuildSortKey> = new Set([GUILD_SORT_KEYS.level, GUILD_SORT_KEYS.itemLevel]);

/** URL search params of the member list. */
export const GUILD_PARAMS = { query: "q", className: "class", minLevel: "level", sort: "sort", direction: "dir" } as const;
export const GUILD_DIRECTION_DESC = "desc";
export const GUILD_DIRECTION_ASC = "asc";

/** The level filter's choices (0 = any level). */
export const GUILD_LEVEL_BANDS: readonly number[] = [0, 60, 50, 40, 30, 20, 10];

/** A roster older than this gets the "updates when someone looks up a member" note. */
export const GUILD_ROSTER_FRESH_HOURS = 12;
/** A member refreshed this much before the roster says when they were last updated. */
export const GUILD_MEMBER_STALE_HOURS = 24;

/** How the search box waits before writing to the URL. */
export const GUILD_SEARCH_DEBOUNCE_MS = 250;

/** The whole-page states that replace the member list. */
export const GUILD_PAGE_STATES = { notStored: "not_stored", collecting: "collecting", gone: "gone" } as const;
export type GuildPageState = (typeof GUILD_PAGE_STATES)[keyof typeof GUILD_PAGE_STATES];

/** What the page says when the guild can't be loaded at all (not a 404). */
export const GUILD_LOAD_PROBLEM = "Couldn't load this guild. Check your connection and try again.";

/** What each whole-page state says. */
export const GUILD_STATE_MESSAGES: Readonly<Record<GuildPageState, string>> = {
  [GUILD_PAGE_STATES.notStored]:
    "We don't have this guild yet. Look up one of its members on Your character and we'll start collecting its roster.",
  [GUILD_PAGE_STATES.collecting]: "We're collecting this guild's roster from Blizzard. It usually takes under half an hour.",
  [GUILD_PAGE_STATES.gone]: "Blizzard no longer lists this guild. It may have disbanded or been renamed.",
};

/** The guild API's "never stored" status. */
export const GUILD_NOT_FOUND_STATUS = 404;
/** Shown in a member-table cell Blizzard gave no value for. */
export const GUILD_MISSING_VALUE = "—";
/** The loading skeleton's member rows and toolbar controls. */
export const GUILD_SKELETON_ROWS = 8;
export const GUILD_SKELETON_CONTROLS = 4;
export const MS_PER_HOUR = 3_600_000;
