/**
 * Item pages (`/wow-forever/items/:id`). An item's data sits in shard
 * `id % ITEM_PAGE_SHARD_COUNT` — the same constant as
 * `backend/scripts/wow_item_pages/shards.py` (a test pins both).
 */
export const ITEM_PAGE_SHARD_COUNT = 64;

export const ITEM_PAGE_PATH = "/wow-forever/items";

/** Where Back goes when the page wasn't opened from another page. */
export const DEFAULT_ITEM_BACK = { to: "/wow-forever/gear", label: "Back to Best gear" } as const;

/** Every Classic (cmangos) source carries this, once per section. */
export const CLASSIC_SOURCE_LABEL = "Classic source — may differ in Forever";

/** Recipes come from the Forever client itself. */
export const FOREVER_SOURCE_LABEL = "Forever game files";

/** Results the not-found page's item finder shows. */
export const ITEM_FINDER_RESULT_COUNT = 8;
