import type { RecipeFormValues } from "./recipe-form-values";

/** A recipe's own details, as typed: what PATCH /recipes/{id} can change. Blank optional fields are "". */
export type RecipeMetaValues = Pick<RecipeFormValues, "title" | "description" | "source">;
