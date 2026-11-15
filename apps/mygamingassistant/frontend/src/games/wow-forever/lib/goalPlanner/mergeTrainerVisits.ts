/**
 * A profession's rank stops with its trainer recipes hung on the visits made
 * to a trainer (not on a book or quest rank), plus a plain trainer trip when
 * there are recipes to learn but no trainer visit to learn them at.
 */
import { assignTaught } from "@/games/wow-forever/lib/goalPlanner/assignTaught";
import { rankTrainsRecipes, trainerVisitStop } from "@/games/wow-forever/lib/goalPlanner/rankStops";
import type { PlannerProfession } from "@/games/wow-forever/types/goalPlanner/plannerProfession";
import type { PlanStop } from "@/games/wow-forever/types/goalPlanner/planStop";
import type { TaughtRecipe } from "@/games/wow-forever/types/goalPlanner/taughtRecipe";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

export interface TrainerVisitInput {
  profession: PlannerProfession;
  label: string;
  faction: PlayerFaction;
  rankStops: readonly PlanStop[];
  taught: readonly TaughtRecipe[];
  /** The phase a plain trainer trip goes in (the one your skill starts in). */
  startPhase: number;
}

export function mergeTrainerVisits(input: TrainerVisitInput): PlanStop[] {
  const trainers = input.rankStops.filter((s) => rankTrainsRecipes(input.profession, s.phase));
  const fallback = () => trainerVisitStop(input.profession, input.faction, input.label, input.startPhase);
  const assigned = assignTaught(trainers, input.taught, fallback);
  const byId = new Map(assigned.map((s) => [s.id, s]));
  const rankIds = new Set(input.rankStops.map((s) => s.id));
  return [...input.rankStops.map((s) => byId.get(s.id) ?? s), ...assigned.filter((s) => !rankIds.has(s.id))];
}
