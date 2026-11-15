import { MAX_CRAFT_SKILL } from "@/games/wow-forever/crafting/craftRoute";

/** A typed "skill now": a whole number from 0 (not learned) to the cap; empty or nonsense reads as 0. */
export function clampGoalSkill(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.min(MAX_CRAFT_SKILL, Math.max(0, Math.round(value)));
}
