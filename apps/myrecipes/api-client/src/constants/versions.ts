import type { DiffChangeDisplay } from "../types/recipe/diff-change-display";
import type { DiffChangeKind } from "../types/recipe/diff";

/** How many versions a comparison takes. */
export const COMPARE_VERSION_COUNT = 2;

/** The version timeline and diff (GET /recipes/{id}/versions, .../diff), worded the same on the website and the phone. */
export const VERSION_COPY = {
  latest: "latest",
  originalRecipe: "Original recipe",
  noChangeNote: "No change note",
  compare: "Compare",
  nothing: "nothing",
  to: "to",
  noDifferences: "No differences between these versions.",
  identicalHeading: "Identical",
  identicalBody: "These two versions have the same ingredients and steps.",
  ingredients: "Ingredients",
  steps: "Steps",
  noIngredientChanges: "No ingredient changes.",
  noStepChanges: "No step changes.",
  loadFailedHeading: "Couldn't load this comparison",
  loadFailedBody: "One of these versions may not exist. Go back and pick two versions to compare.",
  recipeOrVersionGone: "This recipe or one of its versions no longer exists.",
  notInRecipe: "One of these versions isn't part of this recipe, or no longer exists. Go back and pick two versions to compare.",
  invalidLink: "This link isn't valid. Go back and pick two versions to compare.",
} as const;

/**
 * The words and symbol for each kind of change. Each client paints its own colours, but never by
 * colour alone: the symbol and label say the same thing.
 */
export const DIFF_CHANGE_DISPLAY: Record<DiffChangeKind, DiffChangeDisplay> = {
  added: { label: "Added", symbol: "+" },
  removed: { label: "Removed", symbol: "−" },
  changed: { label: "Changed", symbol: "~" },
};
