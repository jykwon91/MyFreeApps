import type { RecipeSummary } from "./recipe";

/** One page of GET /recipes: its recipes, and how many match the filters across every page. */
export interface RecipeListPage {
  items: RecipeSummary[];
  total: number;
  has_more: boolean;
}
