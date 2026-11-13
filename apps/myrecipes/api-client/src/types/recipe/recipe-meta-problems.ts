/** What stops a recipe's own details saving, by field. Empty when they can be saved. */
export interface RecipeMetaProblems {
  title?: string;
  description?: string;
  source?: string;
}
