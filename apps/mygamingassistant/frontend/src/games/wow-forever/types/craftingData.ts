import type { SourceLookup } from "@/games/wow-forever/data/sourceDecode";
import type { CraftingFile, CraftRecipe, TrainerSkills } from "@/games/wow-forever/types/crafting";

/** One crafting profession's generated recipe, trainer and source data. */
export interface CraftingData {
  file: CraftingFile;
  recipes: ReadonlyMap<number, CraftRecipe>;
  trainerSkills: TrainerSkills;
  sources: SourceLookup;
}
