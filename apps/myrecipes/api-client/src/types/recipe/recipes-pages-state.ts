import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { RecipeSummary } from "./recipe";

/** A paged recipes list, as a screen needs it: `recipes` is every loaded row, most recently updated first. */
export interface RecipesPagesState extends Omit<InfinitePagesResult<RecipeSummary>, "items"> {
  recipes: RecipeSummary[];
}
