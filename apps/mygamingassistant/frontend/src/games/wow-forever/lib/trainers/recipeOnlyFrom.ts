import type { RankTrainer } from "@/games/wow-forever/data/professions/rankTrainerTypes";
import type { TrainerProfessionMap } from "@/games/wow-forever/types/trainers/trainerProfessionMap";

/**
 * Your faction's trainers who teach `spell`, when there are at most `max` of them (Shadoweave: only
 * Jalane Ayrole for the Alliance) — an empty list means none of yours does. Null when enough of them
 * teach it that any trainer of the rank will do.
 */
export function recipeOnlyFrom(
  spell: number,
  npcSpells: TrainerProfessionMap,
  trainers: readonly RankTrainer[],
  max: number,
): readonly RankTrainer[] | null {
  const teaching = trainers.filter((t) => npcSpells[String(t.npcId)]?.some(([s]) => s === spell));
  return teaching.length <= max ? teaching : null;
}
