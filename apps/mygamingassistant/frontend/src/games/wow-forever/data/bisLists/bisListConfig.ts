/** Player-made BiS lists (Best gear → "My lists"). */

/** Every saved list, in this browser only. Bump the version on a breaking shape change. */
export const BIS_LISTS_STORAGE_KEY = "mga.wowForever.gear.bisLists.v1";

/** A shared list rides in the URL fragment (`#list=…`), so it never reaches a server. */
export const BIS_LIST_FRAGMENT_KEY = "list";
/** First field of the fragment; a link with any other version is refused. */
export const BIS_LIST_FRAGMENT_VERSION = "1";
/** Longer fragments are refused unread (18 rows of ids plus a name fit in well under this). */
export const MAX_BIS_LIST_FRAGMENT_LENGTH = 1200;

/** Where a share link opens. */
export const BIS_LIST_PAGE_PATH = "/wow-forever/gear?view=mine";

export const MAX_BIS_LIST_NAME_LENGTH = 60;
/** Saved lists per browser; "New list" is disabled at the cap. */
export const MAX_BIS_LISTS = 50;
/** Item ids are positive integers with at most this many digits. */
export const MAX_ITEM_ID_DIGITS = 7;

/** Name used when a list (or a shared link) has none. */
export const UNNAMED_BIS_LIST = "My list";
export const DUPLICATE_PREFIX = "Copy of ";
