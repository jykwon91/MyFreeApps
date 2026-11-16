import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { RecipeEntryLookup } from "@/games/wow-forever/types/recipes/recipeEntryLookup";
import type { ProfessionRankStep } from "@/games/wow-forever/types/trainers/professionRankStep";
import type { TrainerProfessionMap } from "@/games/wow-forever/types/trainers/trainerProfessionMap";
import type { TrainerRecipeRow } from "@/games/wow-forever/types/trainers/trainerRecipeRow";

/**
 * Every recipe a profession's trainers teach, grouped by rank name: a recipe belongs to the highest
 * rank whose training skill it has reached (the Recipes page's `recipeRank` rule, with Apprentice
 * keeping what comes before Journeyman). Each spell once, from any trainer that lists it; ordered by
 * skill, then name. Spells the recipe book doesn't have are skipped.
 */
export function rankRecipes(
  profession: CraftingProfession,
  steps: readonly ProfessionRankStep[],
  npcSpells: TrainerProfessionMap,
  lookup: RecipeEntryLookup,
): ReadonlyMap<string, readonly TrainerRecipeRow[]> {
  const bySpell = new Map<number, TrainerRecipeRow>();
  for (const tuples of Object.values(npcSpells)) {
    for (const [spell, skill, cost] of tuples) {
      if (bySpell.has(spell)) continue;
      const entry = lookup.get(`${profession}:${spell}`);
      if (!entry) continue;
      bySpell.set(spell, { spell, name: entry.name, skill, cost, spec: entry.spec, status: "needs-data" });
    }
  }
  const out = new Map<string, TrainerRecipeRow[]>(steps.map((s) => [s.name, []]));
  for (const row of bySpell.values()) {
    const reached = steps.filter((s) => Number(s.skill) <= row.skill);
    const step = reached[reached.length - 1] ?? steps[0];
    if (step) out.get(step.name)?.push(row);
  }
  for (const rows of out.values()) {
    rows.sort((a, b) => a.skill - b.skill || (a.name ?? "").localeCompare(b.name ?? ""));
  }
  return out;
}
