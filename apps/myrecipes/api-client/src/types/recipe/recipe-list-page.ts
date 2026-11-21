import type { RecipeSummary } from "./recipe";

/** One page of GET /recipes: its recipes, how many match the filters across every page, and where the next page starts. */
export interface RecipeListPage {
  items: RecipeSummary[];
  total: number;
  has_more: boolean;
  /** Pass back as `cursor` for the next page; null on the last page. */
  next_cursor: string | null;
}
