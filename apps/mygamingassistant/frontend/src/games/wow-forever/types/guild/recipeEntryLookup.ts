import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

/** The Recipes page's entries by `${profession}:${spell}` and by `${profession}:name:${normalised name}`. */
export type RecipeEntryLookup = ReadonlyMap<string, RecipeEntry>;
