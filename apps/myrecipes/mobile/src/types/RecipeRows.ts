import type { RecipeFormValues } from "@myrecipes/api-client/types/recipe/recipe-form-values";

/** The ingredient and step rows a recipe form edits, for a new recipe and a tweak alike. */
export type RecipeRows = Pick<RecipeFormValues, "ingredients" | "steps">;
