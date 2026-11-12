/** The game's standing tiers (Blizzard's `standing.tier`). */
export const STANDING_TIER = {
  hated: 0,
  hostile: 1,
  unfriendly: 2,
  neutral: 3,
  friendly: 4,
  honored: 5,
  revered: 6,
  exalted: 7,
} as const;

/** The pane's colours: red, orange, yellow, then green from Friendly up. Indexed by tier. */
export const STANDING_TONES: readonly string[] = [
  "bg-red-500/15 text-red-700 dark:text-red-300",
  "bg-red-500/15 text-red-700 dark:text-red-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  "bg-yellow-500/15 text-yellow-800 dark:text-yellow-300",
  "bg-green-500/15 text-green-700 dark:text-green-300",
  "bg-green-500/15 text-green-700 dark:text-green-300",
  "bg-green-500/15 text-green-700 dark:text-green-300",
  "bg-green-500/15 text-green-700 dark:text-green-300",
];

/** The bar's fill per tier, matching the label's colour. */
export const STANDING_BARS: readonly string[] = [
  "bg-red-500",
  "bg-red-500",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-green-600",
  "bg-green-600",
  "bg-green-600",
  "bg-green-600",
];

/** Booty Bay, Gadgetzan, Ratchet, Everlook…: at Hostile or worse their guards attack you. */
export const STEAMWHEEDLE_GROUP_ID = 169;
export const GUARDS_ATTACK_NOTE = "Its guards attack you on sight";

/** The group for factions under no header. */
export const OTHER_GROUP_ID = 0;
export const OTHER_GROUP_NAME = "Other";

export const REPUTATIONS_FAILED_NOTE =
  "Blizzard didn't send this character's reputations. Log in and out once, then look again.";
export const NO_REPUTATIONS_NOTE = "This character hasn't met any faction yet.";
