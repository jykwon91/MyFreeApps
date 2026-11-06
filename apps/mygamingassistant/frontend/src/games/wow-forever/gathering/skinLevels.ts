import { SKIN_ANY_SKILL_LEVEL, SKIN_SKILL_SPLIT, UNTRAINED_SKILL } from "@/games/wow-forever/data/professions/gathering/gatheringConfig";

/** Skill per mob level past `SKIN_SKILL_SPLIT`: skill ÷ 5. */
const SKILL_PER_LEVEL_HIGH = 5;
/** Skill per mob level up to it: skill ÷ 10 (+ 10). */
const SKILL_PER_LEVEL_LOW = 10;

/**
 * The highest mob level Skinning `skill` can skin — Classic Era's rule,
 * unconfirmed for Forever: up to skill 100 it's skill ÷ 10 + 10, past it skill ÷ 5.
 */
export function maxSkinnableLevel(skill: number): number {
  if (skill <= SKIN_SKILL_SPLIT) return Math.floor(skill / SKILL_PER_LEVEL_LOW) + SKIN_ANY_SKILL_LEVEL;
  return Math.floor(skill / SKILL_PER_LEVEL_HIGH);
}

/** The skill a mob of `level` needs — the inverse of `maxSkinnableLevel`; level 10 and under need only skill 1. */
export function skillToSkin(level: number): number {
  if (level <= SKIN_ANY_SKILL_LEVEL) return UNTRAINED_SKILL;
  if (level <= maxSkinnableLevel(SKIN_SKILL_SPLIT)) return (level - SKIN_ANY_SKILL_LEVEL) * SKILL_PER_LEVEL_LOW;
  return level * SKILL_PER_LEVEL_HIGH;
}
