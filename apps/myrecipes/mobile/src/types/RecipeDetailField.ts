import type { RecipeMetaValues } from "@myrecipes/api-client/types/recipe/recipe-meta-values";
import type { RecipeTimingField } from "./RecipeTimingField";

/** A recipe's own typed fields, as the keyboard's Return moves through them. */
export type RecipeDetailField = keyof RecipeMetaValues | RecipeTimingField;
