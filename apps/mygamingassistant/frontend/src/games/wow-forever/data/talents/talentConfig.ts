import { MAX_LEVEL } from "@/games/wow-forever/data/levelCap";

/** The calculator's page; a class is `${TALENTS_PATH}/<class id>`. */
export const TALENTS_PATH = "/wow-forever/talents";

/** The first level with a talent point; points available = level − `TALENT_LEVEL_OFFSET`. */
export const MIN_TALENT_LEVEL = 10;
export const TALENT_LEVEL_OFFSET = 9;
export const MAX_TALENT_LEVEL = MAX_LEVEL;
/** Points spent in a tree's rows above before the next row opens. */
export const POINTS_PER_TIER = 5;
export const TALENT_TIERS = 7;
export const TALENT_COLUMNS = 4;
/** Every Classic class has three trees. */
export const TALENT_TREE_COUNT = 3;
/** The skeleton's placeholder cells as [tier, column]: a typical tree's shape. */
export const TALENT_SKELETON_CELLS: readonly (readonly [number, number])[] = [
  [0, 0], [0, 1], [0, 2],
  [1, 0], [1, 1], [1, 2], [1, 3],
  [2, 0], [2, 1], [2, 2],
  [3, 1], [3, 2],
  [4, 0], [4, 1], [4, 2],
  [5, 1], [5, 2],
  [6, 1],
];

/** A press held this long removes a point (touch), as right-click does with a mouse. */
export const TALENT_LONG_PRESS_MS = 500;
/** A finger that moves this far is scrolling, not pressing. */
export const TALENT_LONG_PRESS_SLOP_PX = 8;

/** The share link's build code version (`?b=1-…`). Bump it — and keep decoding 1 — for any format change. */
export const TALENT_BUILD_CODE_VERSION = "1";
export const TALENT_BUILD_PARAM = "b";
export const TALENT_LEVEL_PARAM = "lvl";
/** Longest `?b=` we read: three trees of up to 31 talents, plus separators. */
export const TALENT_BUILD_CODE_MAX_LENGTH = 120;

/** How long "Copied" stays on the Copy link button. */
export const TALENT_COPIED_RESET_MS = 2000;
