import {
  DEFAULT_DROP_RECIPE_PROFESSION,
  DROP_RECIPE_PARAMS,
  DROP_RECIPE_PROFESSIONS,
  DROP_RECIPE_SOURCES,
} from "@/games/wow-forever/data/dropRecipes/dropRecipesConfig";
import type { DropRecipeFilters } from "@/games/wow-forever/types/dropRecipes/dropRecipeFilters";
import { DROP_RECIPE_SORT } from "@/games/wow-forever/types/dropRecipes/dropRecipeSort";

const SORTS: readonly string[] = Object.values(DROP_RECIPE_SORT);

/** `?p=` (default Enchanting), `?source=` (default every source) and `?sort=` (default skill). */
export function dropRecipeFiltersFromParams(params: URLSearchParams): DropRecipeFilters {
  const profession = DROP_RECIPE_PROFESSIONS.find((p) => p === params.get(DROP_RECIPE_PARAMS.profession));
  const source = DROP_RECIPE_SOURCES.find((s) => s === params.get(DROP_RECIPE_PARAMS.source));
  const sort = params.get(DROP_RECIPE_PARAMS.sort);
  return {
    profession: profession ?? DEFAULT_DROP_RECIPE_PROFESSION,
    source: source ?? null,
    sort: sort !== null && SORTS.includes(sort) ? (sort as DropRecipeFilters["sort"]) : DROP_RECIPE_SORT.skill,
  };
}

/** The params for these filters; defaults are left out so the plain URL stays plain. */
export function dropRecipeParams(filters: DropRecipeFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.profession !== DEFAULT_DROP_RECIPE_PROFESSION) params.set(DROP_RECIPE_PARAMS.profession, filters.profession);
  if (filters.source) params.set(DROP_RECIPE_PARAMS.source, filters.source);
  if (filters.sort !== DROP_RECIPE_SORT.skill) params.set(DROP_RECIPE_PARAMS.sort, filters.sort);
  return params;
}
