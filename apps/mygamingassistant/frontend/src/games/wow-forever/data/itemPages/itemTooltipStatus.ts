/** Where an item tooltip's data is: loading its shard, failed, not in the Forever files, a recipe item the profession data knows, or ready. */
export const ITEM_TOOLTIP_STATUS = {
  LOADING: "loading",
  ERROR: "error",
  MISSING: "missing",
  RECIPE: "recipe",
  READY: "ready",
} as const;
