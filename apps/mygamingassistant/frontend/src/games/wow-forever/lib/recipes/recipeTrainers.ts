import { CRAFTING_RANKS, type CraftingRank } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { RankTrainer } from "@/games/wow-forever/data/professions/rankTrainerTypes";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { TrainerProfessionMap } from "@/games/wow-forever/types/trainers/trainerProfessionMap";

/**
 * The rank whose trainers teach a recipe learned at `skill`: the highest rank you'd have trained by then
 * (Artisan for 205). Below Journeyman's 50, the Journeyman trainers — they teach the Apprentice recipes too.
 */
export function recipeRank(profession: CraftingProfession, skill: number): CraftingRank {
  const ranks = CRAFTING_RANKS[profession];
  const reached = ranks.filter((r) => r.skill <= skill);
  return reached[reached.length - 1] ?? ranks[0];
}

/**
 * Of a rank's trainers, the ones whose Classic trainer list has the recipe's spell. When the list isn't
 * loaded yet, or no listed trainer has it, the whole rank list stays — never an empty answer.
 */
export function trainersTeaching(
  trainers: readonly RankTrainer[],
  spell: number,
  npcSpells: TrainerProfessionMap | null,
): readonly RankTrainer[] {
  if (!npcSpells) return trainers;
  const teaching = trainers.filter((t) => npcSpells[String(t.npcId)]?.some(([s]) => s === spell));
  return teaching.length ? teaching : trainers;
}
