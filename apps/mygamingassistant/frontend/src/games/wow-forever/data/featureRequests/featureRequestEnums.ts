/**
 * The feature-request API's enum values (`/wow-forever/suggest`).
 *
 * MUST match the backend's feature-request enums — same values, same order. Every list here is an
 * `export const NAME = [...] as const` array so a backend parity test can read them with a regex
 * (see `backend/tests/test_wow_stat_keys_parity.py` for the pattern). The unions in
 * `types/featureRequests/` are derived from these arrays; never type a value by hand.
 */

/**
 * Every story status. `submitted` and `duplicate` are private and never on the public board, so the page
 * only uses `PUBLIC_STORY_STATUSES`; this list (like `SUBMISSION_VERDICTS`) is kept for the parity test.
 */
export const FEATURE_STORY_STATUSES = [
  "submitted",
  "open",
  "planned",
  "in_progress",
  "shipped",
  "not_planned",
  "duplicate",
] as const;

/** The statuses the public board can show. */
export const PUBLIC_STORY_STATUSES = ["open", "planned", "in_progress", "shipped", "not_planned"] as const;

/** The statuses a player can still vote on. */
export const VOTABLE_STORY_STATUSES = ["open", "planned", "in_progress"] as const;

export const FEATURE_AREAS = [
  "map_travel",
  "leveling_quests",
  "professions",
  "food_consumables",
  "gold_economy",
  "gear_upgrades",
  "class_guides",
  "dungeons_raids",
  "pvp",
  "site_app",
] as const;

export const FEATURE_FEASIBILITIES = ["feasible", "needs_data", "not_possible"] as const;

export const SUBMISSION_VERDICTS = ["new", "duplicate", "needs_clarification", "rejected"] as const;

export const FEATURE_SORTS = ["top", "new"] as const;

// The "about you" context sent with an idea. Class ids match `data/classes.ts` (plus "undecided").
export const CONTEXT_CLASSES = [
  "druid",
  "hunter",
  "mage",
  "paladin",
  "priest",
  "rogue",
  "shaman",
  "warlock",
  "warrior",
  "undecided",
] as const;

export const CONTEXT_EXPERIENCES = ["new", "returning", "veteran"] as const;

export const CONTEXT_LEVEL_BANDS = [
  "1-10",
  "11-20",
  "21-30",
  "31-40",
  "41-50",
  "51-59",
  "60-fresh",
  "60-raiding",
  "not-playing",
] as const;

export const CONTEXT_PROFESSIONS = [
  "alchemy",
  "blacksmithing",
  "enchanting",
  "engineering",
  "herbalism",
  "leatherworking",
  "mining",
  "skinning",
  "tailoring",
  "cooking",
  "fishing",
  "first_aid",
] as const;

export const CONTEXT_ACTIVITIES = [
  "leveling_solo",
  "leveling_group",
  "dungeons",
  "raiding",
  "pvp",
  "gathering_gold",
  "crafting",
  "casual",
] as const;

export const CONTEXT_FACTIONS = ["alliance", "horde", "undecided"] as const;
