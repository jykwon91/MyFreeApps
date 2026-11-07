/** Where an item tooltip's data is: loading its shard, failed, not in the Forever files, or ready. */
export const ITEM_TOOLTIP_STATUS = {
  LOADING: "loading",
  ERROR: "error",
  MISSING: "missing",
  READY: "ready",
} as const;
