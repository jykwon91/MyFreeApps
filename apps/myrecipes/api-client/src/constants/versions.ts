import type { DiffChangeDisplay } from "../types/recipe/diff-change-display";
import type { DiffChangeKind } from "../types/recipe/diff";
import type { VersionDiffField } from "../types/recipe/version-diff-field";

/** How many versions a comparison takes. */
export const COMPARE_VERSION_COUNT = 2;

/** Statuses where asking for a comparison again can't help: a bad id in the link, or a recipe or version that's gone. */
export const DIFF_PERMANENT_ERROR_STATUSES: readonly number[] = [400, 404, 422];

/** The version timeline and diff (GET /recipes/{id}/versions, .../diff), worded the same on the website and the phone. */
export const VERSION_COPY = {
  latest: "latest",
  listLoading: "Loading versions",
  listLoadFailedHeading: "Can't load versions",
  listLoadFailedBody: "Check your connection and try again.",
  listUpdateFailed: "Couldn't update the versions. Check your connection and try again.",
  tryAgain: "Try again",
  originalRecipe: "Original recipe",
  noChangeNote: "No change note",
  compare: "Compare",
  nothing: "nothing",
  to: "to",
  noDifferences: "No differences between these versions.",
  identicalHeading: "Identical",
  identicalBody: "These two versions have the same servings, times, ingredients and steps.",
  onlyOrderChanged: "Only the order changed.",
  reorderedHeading: "Reordered",
  reorderedBody: "Same ingredients and steps, in a different order.",
  details: "Details",
  emptyValue: "—",
  ingredients: "Ingredients",
  steps: "Steps",
  noIngredientChanges: "No ingredient changes.",
  noStepChanges: "No step changes.",
  loadFailedHeading: "Couldn't load this comparison",
  loadFailedBody: "Something went wrong loading this comparison. Try again in a moment.",
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

/** What each per-version field is called in a diff: "Cook time: 30 min → 45 min". */
export const VERSION_DIFF_FIELD_LABELS: Record<VersionDiffField, string> = {
  servings: "Servings",
  prep_minutes: "Prep time",
  cook_minutes: "Cook time",
};
