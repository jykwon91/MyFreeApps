import { CRAFTING_RANKS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import { COOKING_ROUTE } from "@/games/wow-forever/data/professions/cooking";
import { FISHING_ROUTE } from "@/games/wow-forever/data/professions/fishing";
import { GATHERING_RANKS } from "@/games/wow-forever/data/professions/gathering/gatheringRanks";
import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import type { MilestoneStep, RouteStep } from "@/games/wow-forever/data/professions/professionTypes";
import { isGatheringProfession } from "@/games/wow-forever/lib/guideProfession";
import type { ProfessionRankStep } from "@/games/wow-forever/types/trainers/professionRankStep";

/** Apprentice comes with learning the profession from any of its trainers (Classic: cap 75). */
const APPRENTICE: ProfessionRankStep = { name: "Apprentice", skill: "1", level: null, cap: 75, craftingRank: null, milestone: null };

function milestones(route: readonly RouteStep[]): readonly ProfessionRankStep[] {
  return route
    .filter((s): s is MilestoneStep => s.kind === "milestone")
    .map((m) => ({ name: m.name, skill: m.skill, level: null, cap: null, craftingRank: null, milestone: m }));
}

/**
 * A profession's ranks in order, from the same data its Professions guide uses.
 * Character levels and caps are Classic's unless that guide marks them confirmed.
 */
export function professionRankSteps(profession: GuideProfession): readonly ProfessionRankStep[] {
  if (profession === "cooking") return [APPRENTICE, ...milestones(COOKING_ROUTE)];
  if (profession === "fishing") return [APPRENTICE, ...milestones(FISHING_ROUTE)];
  if (isGatheringProfession(profession)) {
    return GATHERING_RANKS.map((r) => ({
      name: r.name,
      skill: String(r.trainAt),
      level: r.level,
      cap: r.cap,
      craftingRank: null,
      milestone: null,
    }));
  }
  return [
    APPRENTICE,
    ...CRAFTING_RANKS[profession].map((r) => ({
      name: r.name,
      skill: String(r.skill),
      level: r.level ?? null,
      cap: r.cap,
      craftingRank: r,
      milestone: null,
    })),
  ];
}
