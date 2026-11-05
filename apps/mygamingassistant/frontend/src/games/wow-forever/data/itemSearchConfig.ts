/** Item search tuning (Item Compare → "Search by name"). */

/** Shortest name fragment searched for. */
export const MIN_ITEM_QUERY_LENGTH = 2;
/** Wait after the last keystroke before searching. */
export const ITEM_SEARCH_DEBOUNCE_MS = 100;
/** Results shown before "Show more". */
export const FIRST_RESULT_COUNT = 8;
/** How many more each "Show more" reveals. */
export const MORE_RESULTS_STEP = 20;
/** Typed words this long may be one letter off when nothing matches exactly. */
export const FUZZY_MIN_TOKEN_LENGTH = 5;
/** At most this many stats on a result row's summary line. */
export const ROW_STAT_COUNT = 2;
/** Requirement at and above which an item counts as level-60 gear when ordering ties. */
export const LEVEL_60_REQUIREMENT = 60;
/** Items named in the empty search box's hint, when the list has them. */
export const EXAMPLE_ITEM_IDS: readonly number[] = [12640, 11604];
/** Rows in the loading skeleton. */
export const SKELETON_ROW_COUNT = 4;
