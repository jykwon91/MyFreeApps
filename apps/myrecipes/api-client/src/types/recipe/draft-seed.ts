import type { DraftOrigin } from "./draft-origin";
import type { RecipeExtractionDraft } from "./extraction";

/** A draft to fill the new-recipe form in from, for the user to review before creating. */
export interface DraftSeed {
  draft: RecipeExtractionDraft;
  /** What the draft was read from, which decides what leaving it untouched would lose. */
  origin: DraftOrigin;
}
