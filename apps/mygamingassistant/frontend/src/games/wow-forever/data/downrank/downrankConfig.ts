import type { WowClassId } from "@/games/wow-forever/data/classes";

export const DOWNRANK_PATH = "/wow-forever/downrank";

/** URL params (replace history): the spell family, level, bonus, talent %s and the below-20 penalty switch. */
export const DOWNRANK_SPELL_PARAM = "spell";
export const DOWNRANK_LEVEL_PARAM = "lvl";
export const DOWNRANK_BONUS_PARAM = "bonus";
export const DOWNRANK_TALENT_PARAM = "tal";
export const DOWNRANK_MANA_PARAM = "mana";
/** `p20=0` turns the below-level-20 penalty off; on is the default and left out. */
export const DOWNRANK_LOW_LEVEL_PARAM = "p20";
export const DOWNRANK_LOW_LEVEL_OFF = "0";

/** The family shown when the saved class has none (warrior, rogue, hunter) or nothing is saved. */
export const DEFAULT_DOWNRANK_CLASS: WowClassId = "priest";

/** The global cooldown: no cast is faster than this. */
export const GLOBAL_COOLDOWN_MS = 1500;
export const MAX_DOWNRANK_BONUS = 2000;
export const MAX_TALENT_PCT = 100;

export const DOWNRANK_SKELETON_ROWS = 5;
