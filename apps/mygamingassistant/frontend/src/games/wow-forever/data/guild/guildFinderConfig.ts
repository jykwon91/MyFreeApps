/** The Guild menu page (/wow-forever/guild): your guild, or find one by name (GET /api/wow/guilds?q=). */

/** URL params: `find` shows the search even with a remembered guild; `q` is the search. */
export const GUILD_FINDER_PARAMS = { find: "find", query: "q" } as const;
export const GUILD_FINDER_FIND_VALUE = "1";
/** Where this browser keeps the last looked-up character's guild. */
export const REMEMBERED_GUILD_STORAGE_KEY = "mga.wowForever.guild.v1";
/** The backend's limits (``GUILD_SEARCH_QUERY_MIN_LENGTH`` / ``_MAX_LENGTH``). */
export const GUILD_FINDER_QUERY_MIN_LENGTH = 2;
export const GUILD_FINDER_QUERY_MAX_LENGTH = 60;
/** How the search box waits before searching. */
export const GUILD_FINDER_DEBOUNCE_MS = 300;
/** Placeholder rows while a search runs. */
export const GUILD_FINDER_SKELETON_ROWS = 4;

export const GUILD_FINDER_COPY = {
  title: "Guild",
  subtitle: "Your guild's members, leaderboards and titles. Or find another guild by name.",
  yourGuild: "Your guild",
  yourGuildNote: "From the last character you looked up.",
  findAnother: "Find another guild",
  find: "Find a guild",
  label: "Guild name",
  placeholder: "e.g. topdeadcenter",
  hint: "Type at least 2 letters.",
  intro:
    "We only have guilds whose members someone has looked up. Look up your character and we'll start collecting your guild.",
  lookUp: "Look up your character",
  problem: "Couldn't search for guilds.",
  results: "Matching guilds",
} as const;
