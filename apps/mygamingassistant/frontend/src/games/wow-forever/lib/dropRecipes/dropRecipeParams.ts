import {
  DEFAULT_DROP_RECIPE_PROFESSION,
  DROP_RECIPE_PARAMS,
  DROP_RECIPE_PROFESSIONS,
  DROP_RECIPE_SOURCES,
  DROP_RECIPE_TRADES,
} from "@/games/wow-forever/data/dropRecipes/dropRecipesConfig";
import { characterSlugFromName } from "@/games/wow-forever/lib/character/characterSlug";
import type { DropRecipeFilters } from "@/games/wow-forever/types/dropRecipes/dropRecipeFilters";
import { DROP_RECIPE_SORT } from "@/games/wow-forever/types/dropRecipes/dropRecipeSort";

const SORTS: readonly string[] = Object.values(DROP_RECIPE_SORT);

/** `?p=` (default Enchanting), `?source=` (default every source), `?sort=` (default skill), `?trade=ah|bop` (default both) and `?who=` (a character slug). */
export function dropRecipeFiltersFromParams(params: URLSearchParams): DropRecipeFilters {
  const profession = DROP_RECIPE_PROFESSIONS.find((p) => p === params.get(DROP_RECIPE_PARAMS.profession));
  const source = DROP_RECIPE_SOURCES.find((s) => s === params.get(DROP_RECIPE_PARAMS.source));
  const sort = params.get(DROP_RECIPE_PARAMS.sort);
  const trade = DROP_RECIPE_TRADES.find((t) => t === params.get(DROP_RECIPE_PARAMS.trade));
  const who = params.get(DROP_RECIPE_PARAMS.character);
  return {
    profession: profession ?? DEFAULT_DROP_RECIPE_PROFESSION,
    source: source ?? null,
    sort: sort !== null && SORTS.includes(sort) ? (sort as DropRecipeFilters["sort"]) : DROP_RECIPE_SORT.skill,
    trade: trade ?? null,
    character: who === null ? null : characterSlugFromName(who),
  };
}

/** The params for these filters; defaults are left out so the plain URL stays plain. */
export function dropRecipeParams(filters: DropRecipeFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.profession !== DEFAULT_DROP_RECIPE_PROFESSION) params.set(DROP_RECIPE_PARAMS.profession, filters.profession);
  if (filters.source) params.set(DROP_RECIPE_PARAMS.source, filters.source);
  if (filters.sort !== DROP_RECIPE_SORT.skill) params.set(DROP_RECIPE_PARAMS.sort, filters.sort);
  if (filters.trade) params.set(DROP_RECIPE_PARAMS.trade, filters.trade);
  if (filters.character) params.set(DROP_RECIPE_PARAMS.character, filters.character);
  return params;
}
