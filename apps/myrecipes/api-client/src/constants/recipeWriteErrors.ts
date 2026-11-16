import type { RecipeWriteAction } from "../types/recipe/recipe-write-action";
import { CONNECTION_MESSAGES } from "./connectionCopy";
import { RECIPE_MANAGE_MESSAGES } from "./recipeManage";
import { COOK_LOG_MESSAGES } from "./cookLog";
import { TWEAK_MESSAGES } from "./tweak";

/** Why a recipe save failed, when the server answered with something other than its own reason. Worded the same on web and phone. */
export const RECIPE_WRITE_MESSAGES = {
  signedOut: "You've been signed out. Sign in again and try once more.",
  forbidden: "You don't have permission to change this recipe.",
  tooLarge: "That's too large to save. Shorten it or remove some content and try again.",
  slowDown: "You're doing that too quickly. Wait a minute and try again.",
  serverTrouble: "Something went wrong on our end. Try again in a moment.",
} as const;

/** What each write says when the failure is a bare 400/404, a 422 without a reason, or nothing more specific. */
export const RECIPE_WRITE_FALLBACKS: Readonly<Record<RecipeWriteAction, string>> = {
  create: RECIPE_MANAGE_MESSAGES.couldntCreate,
  update: RECIPE_MANAGE_MESSAGES.couldntUpdate,
  tweak: TWEAK_MESSAGES.couldntSave,
  logCook: COOK_LOG_MESSAGES.couldntLog,
};

/** Per-write wording that differs from the shared one. */
export const RECIPE_WRITE_OVERRIDES: Readonly<
  Partial<Record<RecipeWriteAction, { offline: string; signedOut: string; invalid: string; changedOrGone: string }>>
> = {
  tweak: {
    offline: CONNECTION_MESSAGES.tweak,
    signedOut: TWEAK_MESSAGES.signInAgain,
    invalid: TWEAK_MESSAGES.checkEntries,
    changedOrGone: TWEAK_MESSAGES.changedOrNotYours,
  },
};
