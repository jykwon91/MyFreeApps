import type { ProfessionRankStep } from "@/games/wow-forever/types/trainers/professionRankStep";

/** "Skill 50 · level 10 · cap 150", leaving out whatever the rank doesn't have. */
export function rankFacts(step: ProfessionRankStep): string {
  return [`Skill ${step.skill}`, step.level !== null ? `level ${step.level}` : null, step.cap !== null ? `cap ${step.cap}` : null]
    .filter((f): f is string => f !== null)
    .join(" · ");
}
