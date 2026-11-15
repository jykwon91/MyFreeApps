/**
 * The skill each rank on a profession's ladder is trained at (Apprentice 0),
 * from the Professions guide's own steps — so rank stops and the crafting
 * phases they open agree on where each phase begins.
 */
import { SKILL_PER_RANK } from "@/games/wow-forever/data/goalPlanner/goalPlannerConfig";
import { routeStepEnd } from "@/games/wow-forever/lib/professions/routeStepEnd";
import { professionRankSteps } from "@/games/wow-forever/lib/trainers/professionRankSteps";
import type { PlannerProfession } from "@/games/wow-forever/types/goalPlanner/plannerProfession";

export function rankSkills(profession: PlannerProfession): number[] {
  return professionRankSteps(profession).map((step, index) =>
    index === 0 ? 0 : (routeStepEnd(step.skill) ?? SKILL_PER_RANK * index),
  );
}

/** The ladder phase a skill falls in: the last rank trained at or below it. */
export function phaseForSkill(profession: PlannerProfession, skill: number): number {
  const skills = rankSkills(profession);
  let phase = 0;
  skills.forEach((at, index) => {
    if (at <= skill) phase = index;
  });
  return phase;
}
