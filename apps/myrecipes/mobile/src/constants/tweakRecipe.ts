/**
 * Copy for tweaking a recipe on the phone, as the website's /recipes/:id/tweak words it. What a
 * failed save says, and the problems with what's typed, come from the API client.
 */
export const TWEAK_RECIPE_MESSAGES = {
  screenTitle: "Tweak recipe",
  tweak: "Tweak this recipe",
  tweakHint: "Saves your changes as a new version. The old one is kept.",
  signInHeading: "Sign in to tweak this recipe",
  signInBody: "Tweaks are saved as new versions of your recipe, so you can open them on the website too.",
  loading: "Loading recipe",
  startingFrom: (versionNumber: number) =>
    `Starting from v${versionNumber}. Saving creates a new version and keeps this one.`,
  changeNoteLabel: "What did you change?",
  changeNotePlaceholder: "e.g. Cut the sugar by half, added vanilla",
  save: "Save new version",
  saving: "Saving version…",
  notFoundHeading: "Recipe not found",
  notFoundBody: "This recipe doesn't exist or has no version to tweak.",
  backToRecipes: "Back to recipes",
  loadFailedHeading: "Can't load this recipe",
  loadFailedBody: "Check your connection and try again.",
  tryAgain: "Try again",
  notOwnerHeading: "You can only tweak your own recipes",
  notOwnerBody:
    "This recipe belongs to someone else. You can view it, but tweaking creates a new version that only the owner can make.",
  backToRecipe: "Back to recipe",
} as const;

/** How many rows the loading form shows while the recipe is asked for. */
export const TWEAK_SKELETON_INGREDIENTS = 3;
export const TWEAK_SKELETON_STEPS = 2;
