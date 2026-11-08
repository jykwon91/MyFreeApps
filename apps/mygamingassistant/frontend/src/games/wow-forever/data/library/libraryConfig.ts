/** The library books page's fixed values: path, storage key, URL params and texts. */

export const LIBRARY_PAGE_PATH = "/wow-forever/library";

/** Ticked "Found" books (item ids). Stored — never rename. */
export const LIBRARY_CHECKLIST_STORAGE_KEY = "mga.wowForever.library.checklist.v1";

export const LIBRARY_QUERY_PARAM = "q";
export const LIBRARY_ITEM_LEVEL_PARAM = "ilvl";
export const LIBRARY_HIDE_FOUND_PARAM = "hide";
/** The value the "hide found" URL param takes when on. */
export const LIBRARY_PARAM_ON = "1";

/** Book cards the skeleton draws while the data loads. */
export const LIBRARY_SKELETON_ROWS = 5;

/** What the game files don't say. Shown where the fact would be — never guessed. */
export const LIBRARY_UNKNOWN = {
  where: "Not known yet",
  turnIn: "Not known yet",
  booksNeeded: "Not known yet",
} as const;

export const LIBRARY_EMPTY = {
  filtered: "No books match these filters.",
  allFound: "You've ticked every book that matches. Untick “Hide found” to see them.",
  noRewardQuest: "Our copy of WoW Forever hasn't been sent a library reward quest yet.",
} as const;

/** The library data's load states (`LibraryState.status`). */
export const LIBRARY_STATUS = { idle: "idle", loading: "loading", ready: "ready", error: "error" } as const;
