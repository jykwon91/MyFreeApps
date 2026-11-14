import type { RecipeCategory } from "@/games/wow-forever/types/recipes/recipeCategory";
import type { RecipeProfession } from "@/games/wow-forever/types/recipes/recipeProfession";

/** The Recipes page's search, kept in the URL. */
export interface RecipeFilters {
  query: string;
  profession: RecipeProfession | undefined;
  category: RecipeCategory | undefined;
}
