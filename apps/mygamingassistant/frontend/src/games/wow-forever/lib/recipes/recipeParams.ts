import { RECIPE_CATEGORIES, RECIPE_PARAMS, RECIPE_PROFESSIONS } from "@/games/wow-forever/data/recipes/recipesConfig";
import type { RecipeFilters } from "@/games/wow-forever/types/recipes/recipeFilters";
import type { RecipeCategory } from "@/games/wow-forever/types/recipes/recipeCategory";
import type { RecipeProfession } from "@/games/wow-forever/types/recipes/recipeProfession";

function pick<T extends string>(options: readonly T[], raw: string | null): T | undefined {
  return options.find((o) => o === raw);
}

/** `?p=` — a profession, else undefined (all). */
export function parseRecipeProfession(params: URLSearchParams): RecipeProfession | undefined {
  return pick(RECIPE_PROFESSIONS, params.get(RECIPE_PARAMS.profession));
}

/** `?c=` — a category, else undefined (all). */
export function parseRecipeCategory(params: URLSearchParams): RecipeCategory | undefined {
  return pick(RECIPE_CATEGORIES, params.get(RECIPE_PARAMS.category));
}

/** The params with one key set (or removed when undefined), keeping the rest. */
export function withRecipeParam(params: URLSearchParams, key: string, value: string | undefined): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value === undefined) next.delete(key);
  else next.set(key, value);
  return next;
}

/** The search and both filters as the URL has them (before the search box's debounce). */
export function recipeFiltersFromParams(params: URLSearchParams): RecipeFilters {
  return { query: params.get(RECIPE_PARAMS.query) ?? "", profession: parseRecipeProfession(params), category: parseRecipeCategory(params) };
}
