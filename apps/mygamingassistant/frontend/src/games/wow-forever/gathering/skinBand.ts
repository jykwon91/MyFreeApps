import {
  SKIN_BAND_WIDTH,
  SKIN_LEVEL_HEADROOM,
  UNTRAINED_SKILL,
} from "@/games/wow-forever/data/professions/gathering/gatheringConfig";
import { maxSkinnableLevel } from "@/games/wow-forever/gathering/skinLevels";
import type { SkinBand } from "@/games/wow-forever/types/gathering/skinBand";

/** The lowest mob level there is. */
const MIN_MOB_LEVEL = 1;

/**
 * The mob levels to skin now: up to what your skill can skin, but no more
 * than `SKIN_LEVEL_HEADROOM` levels above you, and down `SKIN_BAND_WIDTH` from
 * there. No skill = just trained (1); no level = only the skill limits it.
 */
export function skinBand(skill: number | null, level: number | null): SkinBand {
  const at = skill ?? UNTRAINED_SKILL;
  const skillMax = maxSkinnableLevel(at);
  const levelMax = level === null ? skillMax : level + SKIN_LEVEL_HEADROOM;
  const max = Math.min(skillMax, levelMax);
  return { skill: at, level, min: Math.max(MIN_MOB_LEVEL, max - SKIN_BAND_WIDTH), max, skillMax, levelCapped: max < skillMax };
}
