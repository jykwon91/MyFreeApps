import type { RecipeExtractionDraft } from "../types/recipe/extraction";

/** A draft that came back thin, so the editor should ask the user to double-check it. */
export function draftNeedsReview(draft: RecipeExtractionDraft): boolean {
  return draft.title.trim() === "" || draft.ingredients.length === 0 || draft.steps.length === 0;
}
