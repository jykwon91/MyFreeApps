import { COOK_LOG_MESSAGES } from "@myrecipes/api-client/constants/cookLog";

/**
 * Copy for logging a cook and the cook log on the phone. What the sheet, the list and a delete say
 * afterwards comes from the API client, worded as the website words it.
 */
export const COOK_LOG_PHONE_MESSAGES = {
  madeItHint: "Logs how this cook turned out: a rating and notes.",
  saving: "Saving…",
  cancel: "Cancel",
  loading: COOK_LOG_MESSAGES.loading,
  loadFailed: COOK_LOG_MESSAGES.loadFailed,
  updateFailed: COOK_LOG_MESSAGES.updateFailed,
  tryAgain: COOK_LOG_MESSAGES.tryAgain,
  deleteRowLabel: (date: string) => `Delete cook log from ${date}`,
  deleteHint: "Asks before deleting this cook log.",
  rated: (rating: number) => `rated ${rating} out of 5`,
} as const;

/** How many rows the loading cook log shows. */
export const COOK_LOG_SKELETON_ROWS = 2;
