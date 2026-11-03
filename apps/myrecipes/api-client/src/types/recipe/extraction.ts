/**
 * AI-extracted recipe *draft* — the response of POST /recipes/extract.
 *
 * Mirrors the backend `RecipeDraftResponse`. Lenient on purpose: `title` may be
 * "" and any field may be null/empty when the photo didn't show it. Nothing
 * here is persisted — the user reviews and edits it in the recipe editor, then
 * saves through the normal create flow (POST /recipes).
 */
export interface DraftIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
}

export interface DraftStep {
  instruction: string;
}

export interface RecipeExtractionDraft {
  title: string;
  description: string | null;
  source: string | null;
  servings: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  ingredients: DraftIngredient[];
  steps: DraftStep[];
}
