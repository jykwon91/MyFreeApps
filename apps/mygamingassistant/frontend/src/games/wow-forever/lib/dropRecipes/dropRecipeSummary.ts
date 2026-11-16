import { DROP_RECIPE_SOURCE_LABELS } from "@/games/wow-forever/data/dropRecipes/dropRecipesConfig";
import { levelRange } from "@/games/wow-forever/food/recipeSources";
import { killsPerDrop } from "@/games/wow-forever/lib/dropRecipes/killsPerDrop";
import type { DropRecipe } from "@/games/wow-forever/types/dropRecipes/dropRecipe";
import { DROP_RECIPE_SOURCE } from "@/games/wow-forever/types/dropRecipes/dropRecipeSource";

interface BestSpot {
  name: string;
  place: string;
  chance: number;
}

/** The single best mob to hunt it from, open world or inside; null when it's only a random drop. */
function bestSpot(recipe: DropRecipe): BestSpot | null {
  const [target] = recipe.targets;
  const [inside] = recipe.instanceDrops;
  if (target && (!inside || target.chance >= inside.chance)) return { name: target.name, place: target.spot?.zoneName ?? "", chance: target.chance };
  if (inside) return { name: inside.name, place: inside.instance.name, chance: inside.chance };
  return null;
}

/**
 * The closed row's "where" line: the best place to hunt it and the odds —
 * "Pyromancer Loregrain, Blackrock Depths · 40% (about 1 in 3 kills) · +2 more",
 * or "Random drop · mobs level 10–37" when nothing is worth hunting.
 */
export function dropRecipeSummary(recipe: DropRecipe): string {
  const best = bestSpot(recipe);
  if (!best) return `${DROP_RECIPE_SOURCE_LABELS[DROP_RECIPE_SOURCE.random]} · mobs ${levelRange(recipe.random?.levels ?? [0, 0])}`;
  const odds = killsPerDrop(best.chance);
  const others = recipe.targets.length + recipe.moreTargets + recipe.instanceDrops.length - 1;
  const parts = [`${best.name}${best.place ? `, ${best.place}` : ""} · ${best.chance}%${odds ? ` (${odds})` : ""}`];
  if (others > 0) parts.push(`+${others} more`);
  return parts.join(" · ");
}
