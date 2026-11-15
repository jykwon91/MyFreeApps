import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListRecipesInfiniteQuery } from "../store/recipesApi";
import type { ListRecipesArgs } from "../types/recipe/list-recipes-args";
import type { RecipesPagesState } from "../types/recipe/recipes-pages-state";

/** GET /recipes a page at a time, most recently updated first. Shared by the web page and the phone screen. */
export function useRecipesPages(args: ListRecipesArgs): RecipesPagesState {
  const { items, ...pages } = useInfinitePages(useListRecipesInfiniteQuery(args));
  return { ...pages, recipes: items };
}
