import type { LevelSaveFailure } from "../types/onboarding/level-save-failure";

/** The two onboarding steps' copy, on the website and the phone. */
export const ONBOARDING_COPY = {
  languageStep: "Step 1 of 2",
  languageHeading: "What would you like to practice?",
  languageIntro: "You'll have short spoken conversations with an AI tutor. You can change this later.",
  levelStep: "Step 2 of 2",
  levelHeading: "Where are you starting from?",
  levelIntro: "The tutor adjusts how fast and how simply it speaks. You can change this any time.",
  levelLegend: "Your level",
  saveFailed: "Couldn't save your choice. Try again.",
  saveUnsure: "We didn't get an answer, so we're not sure your choice was saved. Trying again is safe.",
  continue: "Continue",
  saving: "Saving",
} as const;

/** What to say for each way a level save can fail. Saving a level again is harmless, so a lost answer says so. */
export const LEVEL_SAVE_FAILURE_COPY: Readonly<Record<LevelSaveFailure, string>> = {
  failed: ONBOARDING_COPY.saveFailed,
  unsure: ONBOARDING_COPY.saveUnsure,
};
