import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

/** A search hit, and the reagent it matched on when the name didn't. */
export interface RecipeMatch {
  entry: RecipeEntry;
  /** Set when the query matched only a reagent ("uses Silk Cloth"). */
  viaReagent: string | null;
}
