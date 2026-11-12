import { LEVEL_OPTIONS } from "@mylanguagetutor/api-client/constants/levelOptions";

export const CATALOG_MESSAGES = {
  retryOffer: "Check your connection and try again.",
  noScenariosHeading: "No scenarios yet",
  noScenariosBody: "Scenarios for this language will show up here.",
  loadingLanguages: "Loading languages",
  loadingScenarios: "Loading scenarios",
} as const;

/** As many placeholder cards as the website's skeletons show. */
export const LANGUAGE_SKELETON_ROWS = 3;
/** A placeholder per level to choose from. */
export const LEVEL_SKELETON_ROWS = LEVEL_OPTIONS.length;
export const SCENARIO_SKELETON_ROWS = 4;
