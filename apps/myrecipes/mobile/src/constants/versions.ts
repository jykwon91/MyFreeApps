import { COMPARE_VERSION_COUNT } from "@myrecipes/api-client/constants/versions";
import type { DiffChangeKind } from "@myrecipes/api-client/types/recipe/diff";
import type { ChipTone } from "@platform/mobile";
import type { DiffEntryPoint } from "../types/DiffEntryPoint";

/**
 * Copy for a recipe's version history and diffs on the phone. What the diff itself says (its header,
 * sections, change words and errors) comes from the API client, worded the same as the website.
 */
export const VERSION_HISTORY_MESSAGES = {
  screenTitle: "Version history",
  open: "Version history",
  openHint: (versions: string) => `Shows all ${versions} and what changed in each.`,
  loading: "Loading versions",
  loadFailedHeading: "Can't load versions",
  loadFailedBody: "Check your connection and try again.",
  updateFailed: "Couldn't update the versions. Check your connection and try again.",
  tryAgain: "Try again",
  notFoundHeading: "Recipe not found",
  notFoundBody: "It may have been deleted, or the link may be wrong.",
  backToRecipes: "Back to recipes",
  startCompare: "Compare versions",
  cancelCompare: "Cancel",
  compare: "Compare",
  compareHint: "Opens what changed between the two versions you picked.",
  pickTwo: (picked: number) => `Pick two versions to compare (${picked} of ${COMPARE_VERSION_COUNT}).`,
  openVersionHint: "Shows this version's ingredients and steps.",
  pickHint: "Picks this version to compare.",
  bestRating: (rating: number) => `Best ${rating}/5`,
  bestRatingLabel: (rating: number) => `best rating ${rating} out of 5`,
} as const;

export const VERSION_DIFF_MESSAGES = {
  screenTitle: "Changes",
  loading: "Loading comparison",
  updateFailed: "Couldn't update this comparison. Check your connection and try again.",
  goBack: "Go back",
} as const;

/** Copy for one version shown in full, as the website shows the version picked in its timeline. */
export const VERSION_VIEW_MESSAGES = {
  screenTitle: "Version",
  loading: "Loading version",
  loadFailedHeading: "Can't load this version",
  loadFailedBody: "Check your connection and try again.",
  updateFailed: "Couldn't update this version. Check your connection and try again.",
  tryAgain: "Try again",
  notFoundHeading: "Version not found",
  notFoundBody: "It may have been deleted, or the link may be wrong.",
  goBack: "Go back",
  changes: "What changed",
  // The server diffs against the version it was based on, which a restore or a tweak of an older
  // version makes older than the one numbered just before.
  changesHint: "Shows what changed from the version it was based on.",
} as const;

/** What the version list tells a diff it opens, so the diff's Back is named for it. */
export const VERSION_LIST_ENTRY_POINT: DiffEntryPoint = "versions";

/** What a version shown in full tells the diff its What changed opens. */
export const VERSION_VIEW_ENTRY_POINT: DiffEntryPoint = "version";

/** What a diff tells the tweak form it opens, so the form's Back is named for it. */
export const DIFF_TWEAK_ENTRY_POINT = "diff";

/** How many rows the loading list and loading diff show. */
export const VERSION_SKELETON_ROWS = 4;
export const DIFF_SKELETON_ROWS = 3;
/** How many ingredient and step rows a version shows while it loads. */
export const VERSION_VIEW_SKELETON_INGREDIENTS = 5;
export const VERSION_VIEW_SKELETON_STEPS = 3;

/** The phone's colour for each kind of change, the web's green, red and amber. Never the only signal. */
export const DIFF_CHANGE_TONES: Record<DiffChangeKind, Exclude<ChipTone, "neutral">> = {
  added: "success",
  removed: "danger",
  changed: "warning",
};

/** The size of the box drawn beside a version while picking two to compare. */
export const COMPARE_CHECKBOX_SIZE = 22;
