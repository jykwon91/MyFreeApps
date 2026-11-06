/** Items listed per slot card. */
export const TOP_ITEMS_PER_SLOT = 3;

/**
 * "Close" scores: an item with a known source ranks above one with no known
 * source unless the unknown one scores more than this many percent higher.
 * Approximate weights can't tell items a few percent apart, and an item you
 * can find beats one nobody can say where to get.
 */
export const CLOSE_SCORE_PCT = 3;

/** Level the pre-raid table is for. */
export const PRE_RAID_LEVEL = 60;

/** Raids open in Forever on this date (Blizzard). */
export const RAIDS_OPEN_LABEL = "December 9";

/** A published list to compare against — linked only, never copied into our data. */
export const PUBLISHED_LIST = {
  name: "LFCarry",
  url: "https://lfcarry.com/guides/wow-forever-bis-lists",
  checked: "2026-11-04",
} as const;
