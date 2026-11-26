import { PLANNER_PROFESSION_LABELS } from "@/games/wow-forever/data/goalPlanner/goalPlannerConfig";
import type { CraftReagent } from "@/games/wow-forever/types/crafting";
import type { RecipeItem } from "@/games/wow-forever/types/itemPages/recipeItem";

/** "Requires Tailoring (235)" — "about 235" when the skill is an estimate. */
export function recipeRequiresText(recipe: RecipeItem): string {
  return `Requires ${PLANNER_PROFESSION_LABELS[recipe.profession]} (${recipe.estimated ? "about " : ""}${recipe.skill})`;
}

/** "Use: Teaches you how to make Runecloth Boots" — an enchant makes no item, so it names the recipe. */
export function recipeUseText(recipe: RecipeItem): string {
  return `Use: Teaches you how to make ${recipe.creates?.name ?? recipe.recipeName}`;
}

/** "Reagents: Bolt of Runecloth (4), Rune Thread" — the game's line under a crafted item. */
export function reagentsText(reagents: readonly CraftReagent[]): string {
  return `Reagents: ${reagents.map((r) => (r.count > 1 ? `${r.name} (${r.count})` : r.name)).join(", ")}`;
}
