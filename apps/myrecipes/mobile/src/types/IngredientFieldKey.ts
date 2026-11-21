import type { IngredientField } from "./IngredientField";

/** One ingredient row's field, named by the row's key so Return can move on to the next row. */
export type IngredientFieldKey = `${string}:${IngredientField}`;
