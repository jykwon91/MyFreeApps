import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { RecipeEntryLookup } from "@/games/wow-forever/types/recipes/recipeEntryLookup";
import type { TrainerNpcSpells } from "@/games/wow-forever/types/trainers/trainerNpcSpells";
import type { TrainerRecipeRow } from "@/games/wow-forever/types/trainers/trainerRecipeRow";

/**
 * Build the recipe list for one NPC, enriched from the recipe book.
 * Spells not in the recipe book are skipped once the book has loaded.
 */
export function trainerNpcRecipes(
  npcId: number,
  profession: CraftingProfession,
  spells: TrainerNpcSpells,
  lookup: RecipeEntryLookup | null,
  playerSkill: number | null,
): TrainerRecipeRow[] {
  const tuples = spells[profession][String(npcId)];
  if (!tuples) return [];

  const rows: TrainerRecipeRow[] = [];
  for (const [spell, skill, cost] of tuples) {
    const entry = lookup?.get(`${profession}:${spell}`) ?? null;
    if (lookup && !entry) continue;
    rows.push({ spell, name: entry?.name ?? null, skill, cost, status: classifySkill(skill, playerSkill) });
  }
  return rows;
}

function classifySkill(recipeSkill: number, playerSkill: number | null): TrainerRecipeRow["status"] {
  if (playerSkill === null) return "needs-data";
  return playerSkill >= recipeSkill ? "can-learn" : "needs-skill";
}
