import type { RecipeExtractionDraft } from "@myrecipes/api-client/types/recipe/extraction";
import type { DraftOrigin } from "./DraftOrigin";
import type { RecipeEntryPoint } from "./RecipeEntryPoint";

/** A draft to fill the new-recipe form in from, for the user to review before creating. */
export interface NewRecipeSeed {
  draft: RecipeExtractionDraft;
  /** What the draft was read from, which the form names when it asks for it to be checked. */
  origin: DraftOrigin;
  /** Where the form was opened from, other than Recipes: the new recipe replaces the form, so its Back goes there. */
  from?: RecipeEntryPoint;
  /** Told the new recipe's id once it's created. */
  onCreated?: (recipeId: string) => void;
}
