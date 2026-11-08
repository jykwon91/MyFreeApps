/** The rares finder's fixed values: paths, storage keys, URL params, the level band and texts. */

export const RARES_PAGE_PATH = "/wow-forever/rares";

/** Ticked "Seen / killed" rares (creature ids). Stored — never rename. */
export const RARES_CHECKLIST_STORAGE_KEY = "mga.wowForever.rares.checklist.v1";

export const RARE_ZONE_PARAM = "zone";
export const RARE_MIN_LEVEL_PARAM = "min";
export const RARE_MAX_LEVEL_PARAM = "max";
export const RARE_FIT_PARAM = "fit";
export const RARE_FIT_ON = "1";

export const RARE_LEVEL_MIN = 1;
export const RARE_LEVEL_MAX = 63;

/** "Fits my level": a rare up to this many levels below you… */
export const RARE_FIT_LEVELS_BELOW = 3;
/** …or this many above you (rares hit hard, so not as far up as quests go). */
export const RARE_FIT_LEVELS_ABOVE = 2;

/** The game's limit on one macro's text. */
export const MACRO_MAX_CHARS = 255;

/** The classification codes the generator writes (the Forever client's own numbers). */
export const RARE_CLASSIFICATION = { rare: "rare", rareElite: "rare_elite" } as const;
export const RARE_CLASSIFICATION_CODE: Readonly<Record<number, (typeof RARE_CLASSIFICATION)[keyof typeof RARE_CLASSIFICATION]>> = {
  2: RARE_CLASSIFICATION.rareElite,
  4: RARE_CLASSIFICATION.rare,
};
export const RARE_CLASSIFICATION_LABEL: Readonly<Record<(typeof RARE_CLASSIFICATION)[keyof typeof RARE_CLASSIFICATION], string>> = {
  rare: "Rare",
  rare_elite: "Rare elite",
};

/** How far the World Map zooms in, at most, on a rare's spots (1 = the whole zone). */
export const RARE_MAP_MAX_SCALE = 3;
/** Room left round a rare's spots when the map is fitted to them (a fraction of the zone). */
export const RARE_MAP_PADDING = 0.15;

/** Cards the list's skeleton draws while the data loads. */
export const RARES_SKELETON_ROWS = 4;

export const RARES_EMPTY = {
  filtered: "No rares match these filters.",
  noLevel: "Set your level to use “Fits my level”.",
  noDrops: "No drops of its own in the Classic data.",
  newInForever: "New in Forever — where it spawns and what it drops aren't in our data yet.",
} as const;
