import type { IngredientResponse } from "@myrecipes/api-client/types/recipe/ingredient";

/** What an ingredient list shows: a saved recipe's ingredient, or one read off a web page. */
export type RecipeIngredientLine = Pick<IngredientResponse, "id" | "position" | "name" | "quantity" | "unit" | "note">;
